import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { extractPage } from "./extract";
import { Feedbin } from "./feedbin";
import type { Entry } from "./feedbin";
import { HighlightStore } from "./highlights";
import { ManualStore } from "./manual";
import { MarkMode } from "./mark";
import { isExpired, LinkStore } from "./share";
import { listPage, messagePage, readerPage, SHARE_DAYS } from "./views";

const HTTP_OK = 200;
const HTTP_NO_CONTENT = 204;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_METHOD_NOT_ALLOWED = 405;
const HTTP_GONE = 410;
const HTTP_UNPROCESSABLE = 422;
const HTTP_ERROR = 500;
const DEFAULT_PORT = 3000;
// Loopback by default: reachable only through a reverse proxy on this machine.
// Set HOST=0.0.0.0 to listen on the network (then set ADMIN_PASSWORD).
const LISTEN_HOST = process.env.HOST || "127.0.0.1";

const NONCE_BYTES = 16;
const MAX_QUOTE_CHARS = 1000;
const MAX_CONTEXT_CHARS = 64;
const MAX_HIGHLIGHTS_PER_ENTRY = 200;
const MAX_URL_CHARS = 2048;
const WEB_PROTOCOLS = ["http:", "https:"];

// Strict by default: no scripts, no network calls.
const CSP =
  "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";

// The admin list needs its own script and fetch(). Only a script carrying
// this response's nonce may run.
function adminCsp(nonce: string): string {
  return `${CSP}; script-src 'nonce-${nonce}'; connect-src 'self'`;
}

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing env ${name}`);
  }

  return v;
}

const feedbin = new Feedbin(
  env("FEEDBIN_EMAIL"),
  env("FEEDBIN_PASSWORD"),
  Number(process.env.FEEDBIN_PAGES_FEED_ID) || null,
);
const SHARE_URL = env("SHARE_URL").replace(/\/$/, "");
// Optional. Unset: no login, a reverse proxy must protect the admin routes.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const links = new LinkStore(process.env.LINKS_FILE ?? "data/links.json");
const highlights = new HighlightStore(process.env.HIGHLIGHTS_FILE ?? "data/highlights.json");
const manual = new ManualStore(process.env.MANUAL_FILE ?? "data/manual.json");

async function findEntry(id: number): Promise<Entry | null> {
  return manual.find(id) ?? (await feedbin.entry(id));
}

// Feedbin pages and manual ones in one list, newest first.
async function allEntries(): Promise<Entry[]> {
  const merged = [...manual.list(), ...(await feedbin.list())];

  return merged.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

function newNonce(): string {
  return randomBytes(NONCE_BYTES).toString("base64");
}

function html(body: string, status = HTTP_OK, csp = CSP): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": csp,
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}

function notFound(): Response {
  return html(messagePage("Not found", "This page does not exist."), HTTP_NOT_FOUND);
}

// Public: stored, expiring link. Everything else is authenticated by the reverse proxy.
async function sharedRoute(token: string): Promise<Response> {
  const link = links.find(token);
  if (!link) {
    return notFound();
  }
  if (isExpired(link)) {
    return html(messagePage("Link expired", "Ask the sender for a new link."), HTTP_GONE);
  }

  const entry = await findEntry(link.entryId);
  if (!entry) {
    return notFound();
  }

  // Counted only when the article renders, not for expired or unknown links.
  links.click(token);

  const until = new Date(link.expiresAt * 1000).toLocaleDateString("en", { month: "short", day: "numeric" });

  return html(readerPage(entry, `Link valid until ${until}`, highlights.list(entry.id), MarkMode.Public));
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

// HTTP Basic: the username is ignored, only the password counts. Hashing both
// sides gives equal-length buffers for a constant-time compare.
function isAuthorized(req: Request): boolean {
  if (!ADMIN_PASSWORD) {
    return true;
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString();
  const password = decoded.slice(decoded.indexOf(":") + 1);

  return timingSafeEqual(sha256(password), sha256(ADMIN_PASSWORD));
}

function loginRequired(): Response {
  return new Response("Login required", {
    status: HTTP_UNAUTHORIZED,
    headers: { "www-authenticate": 'Basic realm="pagina", charset="UTF-8"' },
  });
}

// Reject state changes that a browser sends from another site.
function isCrossSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");

  return site !== null && site !== "same-origin";
}

// No Feedbin lookup here: the caller is already authenticated, and a network
// round-trip would make every highlight wait on it.
async function addHighlight(req: Request, entryId: number): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const exact = typeof body?.exact === "string" ? body.exact : "";
  const full = highlights.list(entryId).length >= MAX_HIGHLIGHTS_PER_ENTRY;
  if (!exact || exact.length > MAX_QUOTE_CHARS || full) {
    return new Response("Bad highlight", { status: HTTP_BAD_REQUEST });
  }

  const saved = highlights.add(entryId, {
    exact,
    prefix: String(body?.prefix ?? "").slice(-MAX_CONTEXT_CHARS),
    suffix: String(body?.suffix ?? "").slice(0, MAX_CONTEXT_CHARS),
  });

  return Response.json({ id: saved.id });
}

function parseWebUrl(raw: string): URL | null {
  if (raw.length > MAX_URL_CHARS) {
    return null;
  }

  try {
    const parsed = new URL(raw);

    return WEB_PROTOCOLS.includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

// Downloads the page now and keeps a copy. Can take up to the extractor's timeout.
async function addUrl(req: Request): Promise<Response> {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const target = parseWebUrl(typeof body?.url === "string" ? body.url.trim() : "");
  if (!target) {
    return new Response("Not a valid http(s) URL", { status: HTTP_BAD_REQUEST });
  }

  const page = await extractPage(target.href).catch(() => null);
  if (!page) {
    return new Response("Could not read that page", { status: HTTP_UNPROCESSABLE });
  }

  const entry = manual.add({ url: target.href, ...page });

  return Response.json({ id: entry.id });
}

async function adminRoute(req: Request, path: string, url: URL): Promise<Response> {
  if (path === "/") {
    const nonce = newNonce();
    const page = listPage(await allEntries(), links.active(), SHARE_URL, nonce);

    return html(page, HTTP_OK, adminCsp(nonce));
  }

  const preview = path.match(/^\/a\/(\d+)$/);
  if (preview) {
    const entry = await findEntry(Number(preview[1]));
    if (!entry) {
      return notFound();
    }

    const nonce = newNonce();
    const note = "Preview · select text to highlight";
    const page = readerPage(entry, note, highlights.list(entry.id), MarkMode.Admin, nonce);

    return html(page, HTTP_OK, adminCsp(nonce));
  }

  const share = path.match(/^\/share\/(\d+)$/);
  const revoke = path.match(/^\/revoke\/([\w-]+)$/);
  const addHl = path.match(/^\/highlight\/(\d+)$/);
  const delHl = path.match(/^\/unhighlight\/(\d+)\/([\w-]+)$/);
  const addPage = path === "/add";
  const rmPage = path.match(/^\/remove\/(\d+)$/);
  if (!share && !revoke && !addHl && !delHl && !addPage && !rmPage) {
    return notFound();
  }
  if (req.method !== "POST") {
    return new Response("POST only", { status: HTTP_METHOD_NOT_ALLOWED });
  }
  if (isCrossSite(req)) {
    return new Response("Forbidden", { status: HTTP_FORBIDDEN });
  }

  if (addPage) {
    return addUrl(req);
  }
  if (rmPage) {
    const id = Number(rmPage[1]);
    if (!manual.find(id)) {
      return new Response("Not a manual page", { status: HTTP_NOT_FOUND });
    }

    manual.remove(id);

    return new Response(null, { status: HTTP_NO_CONTENT });
  }
  if (addHl) {
    return addHighlight(req, Number(addHl[1]));
  }
  if (delHl) {
    highlights.remove(Number(delHl[1]), delHl[2]);

    return new Response(null, { status: HTTP_NO_CONTENT });
  }
  if (revoke) {
    links.revoke(revoke[1]);

    return new Response(null, { status: HTTP_NO_CONTENT });
  }

  const days = Number(url.searchParams.get("days"));
  if (!SHARE_DAYS.includes(days)) {
    return new Response("Bad days", { status: HTTP_BAD_REQUEST });
  }

  const link = links.create(Number(share![1]), days);

  return new Response(`${SHARE_URL}/s/${link.token}`);
}

Bun.serve({
  hostname: LISTEN_HOST,
  port: Number(process.env.PORT) || DEFAULT_PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    try {
      if (path === "/robots.txt") {
        return new Response("User-agent: *\nDisallow: /\n");
      }

      const shared = path.match(/^\/s\/([\w-]+)$/);
      if (shared) {
        return await sharedRoute(shared[1]);
      }

      if (!isAuthorized(req)) {
        return loginRequired();
      }

      return await adminRoute(req, path, url);
    } catch (err) {
      console.error(err);

      return html(messagePage("Error", String(err instanceof Error ? err.message : err)), HTTP_ERROR);
    }
  },
});

console.log(`pagina on :${process.env.PORT || DEFAULT_PORT}`);
