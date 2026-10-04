import type { Entry } from "./feedbin";
import type { Highlight } from "./highlights";
import { markHighlights, MarkMode } from "./mark";
import type { Link } from "./share";

export const SHARE_DAYS = [1, 7, 30];

const DESCRIPTION_CHARS = 200;

const STYLE = `
:root{
  --bg:#fcfcfb;--fg:#1a1a19;--muted:#5f5e5a;--line:#e4e3df;--soft:#f2f1ee;--accent:#a4452c;
  --font:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --measure:68ch;
  color-scheme:light dark;
}
@media(prefers-color-scheme:dark){:root{--bg:#141413;--fg:#e9e8e4;--muted:#a3a29c;--line:#2c2b29;--soft:#1e1d1c;--accent:#e58c6e}}
@media print{:root{--bg:#fff;--fg:#000;--muted:#444;--line:#ccc;--soft:#f4f4f4;--accent:#000}}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);
  font-size:clamp(1.0625rem,1rem + .3vw,1.1875rem);line-height:1.65;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  padding-left:max(1.25rem,env(safe-area-inset-left));padding-right:max(1.25rem,env(safe-area-inset-right))}
main{max-width:var(--measure);margin:0 auto;padding-block:clamp(2.5rem,6vw,5rem) 6rem}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:2px}
::selection{background:color-mix(in srgb,var(--accent) 25%,transparent)}
.meta{color:var(--muted);font-size:.875rem;line-height:1.5}
.kicker{margin:0 0 .75rem;color:var(--accent);font-size:.8125rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
h1{margin:0 0 1rem;font-size:clamp(1.875rem,1.4rem + 2.2vw,2.75rem);font-weight:700;line-height:1.12;letter-spacing:-.022em;text-wrap:balance}
.byline{margin:0 0 2.5rem;padding-bottom:1.5rem;border-bottom:1px solid var(--line)}
.foot{margin-top:3.5rem;padding-top:1.5rem;border-top:1px solid var(--line)}
article{overflow-wrap:break-word}
article p,article ul,article ol{margin:0 0 1.2em}
article p{text-wrap:pretty}
article h2,article h3,article h4{margin:2.2em 0 .6em;line-height:1.25;font-weight:650;letter-spacing:-.015em;text-wrap:balance}
article h2{font-size:1.5em}
article h3{font-size:1.25em}
article h4{font-size:1.05em}
article ul,article ol{padding-left:1.4em}
article li{margin:.4em 0}
article li::marker{color:var(--muted)}
article a{text-decoration-thickness:.08em;text-underline-offset:.2em;text-decoration-color:color-mix(in srgb,var(--accent) 45%,transparent)}
article a:hover{text-decoration-color:currentColor}
article img,article video{display:block;max-width:100%;height:auto;margin:1.75em auto;border-radius:.5rem}
article figure{margin:1.75em 0}
article figure img{margin:0 auto .6em}
article figcaption{color:var(--muted);font-size:.875rem;line-height:1.5}
article blockquote{margin:1.6em 0;padding:.1em 0 .1em 1.1em;border-left:3px solid var(--accent);color:var(--muted)}
article blockquote p:last-child{margin-bottom:0}
article code,article pre{font-family:var(--mono);font-size:.875em}
article code{padding:.15em .35em;background:var(--soft);border-radius:.25rem}
article pre{overflow-x:auto;padding:1em 1.1em;background:var(--soft);border-radius:.5rem;line-height:1.5}
article pre code{padding:0;background:none}
article table{display:block;overflow-x:auto;border-collapse:collapse;font-size:.9375em}
article th,article td{padding:.5em .75em;border-bottom:1px solid var(--line);text-align:left}
hr{margin:2.5em 0;border:0;border-top:1px solid var(--line)}
ul.list{margin:2rem 0 0;padding:0;list-style:none}
.item{padding:1.1rem 0;border-top:1px solid var(--line)}
.item a.t{color:var(--fg);font-size:1.125rem;font-weight:600;line-height:1.35;text-decoration:none;text-wrap:balance}
.item a.t:hover{color:var(--accent)}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem;margin-top:.5rem}
button{padding:.25rem .8rem;color:var(--fg);font:inherit;font-size:.8125rem;background:none;border:1px solid var(--line);border-radius:999px;cursor:pointer}
button:hover{color:var(--accent);border-color:var(--accent)}
a.link{word-break:break-all;user-select:all}
mark.hl{padding:.05em 0;color:inherit;background:color-mix(in srgb,#ffd24a 55%,transparent);border-radius:.2em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
@media(prefers-color-scheme:dark){mark.hl{background:color-mix(in srgb,#ffd24a 32%,transparent)}}
mark.hl[data-id]{cursor:pointer}
.hl-btn{position:fixed;z-index:10;padding:.35rem .9rem;color:var(--bg);background:var(--fg);border-color:var(--fg);box-shadow:0 2px 10px rgb(0 0 0/.25)}
.hl-btn[hidden]{display:none}
`;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function date(iso: string): string {
  return new Date(iso).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

function shortDate(epoch: number): string {
  return new Date(epoch * 1000).toLocaleDateString("en", { month: "short", day: "numeric" });
}

function layout(title: string, body: string, script = "", head = ""): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<title>${esc(title)}</title>${head}<style>${STYLE}</style></head>
<body><main>${body}</main>${script}</body></html>`;
}

// Open Graph tags: chat apps read these to draw the link preview card.
function previewTags(e: Entry): string {
  const title = e.title ?? e.url;
  const text = (e.content ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, DESCRIPTION_CHARS);
  const image = (e.content ?? "").match(/<img[^>]+src=["'](https:\/\/[^"']+)["']/i)?.[1];
  const tags = [
    ["og:type", "article"],
    ["og:title", title],
    ["og:site_name", host(e.url)],
    ["og:description", text],
    ["og:image", image ?? ""],
  ];

  return tags
    .filter(([, v]) => v)
    .map(([k, v]) => `<meta property="${k}" content="${esc(v)}">`)
    .join("");
}

// Admin preview only: select text -> "Highlight" button; click a highlight ->
// "Remove highlight". The quote (text + 32 chars each side) is computed here,
// the server stores it and paints the <mark>s.
const highlightScript = (nonce: string) => `<script nonce="${nonce}">
(() => {
  const art = document.querySelector("article");
  if (!art) return;
  const CONTEXT = 32;
  const btn = document.createElement("button");
  btn.className = "hl-btn";
  btn.hidden = true;
  document.body.appendChild(btn);
  const entry = art.dataset.entry;
  let action = "";
  let pending = null;
  let target = "";

  function hide() {
    btn.hidden = true;
    action = "";
  }

  function place(rect) {
    btn.style.top = Math.max(8, rect.top - 44) + "px";
    btn.style.left = Math.min(Math.max(8, rect.left + rect.width / 2 - 50), innerWidth - 150) + "px";
  }

  function selection() {
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const r = sel.getRangeAt(0);
    if (!art.contains(r.commonAncestorContainer)) return null;
    const before = document.createRange();
    before.setStart(art, 0);
    before.setEnd(r.startContainer, r.startOffset);
    const full = art.textContent;
    let start = before.toString().length;
    let end = start + r.toString().length;
    while (start < end && /\\s/.test(full[start])) start++;
    while (end > start && /\\s/.test(full[end - 1])) end--;
    if (start >= end) return null;
    return {
      rect: r.getBoundingClientRect(),
      start,
      end,
      quote: {
        exact: full.slice(start, end),
        prefix: full.slice(Math.max(0, start - CONTEXT), start),
        suffix: full.slice(end, end + CONTEXT),
      },
    };
  }

  function refresh() {
    const s = selection();
    if (!s) {
      if (action === "add") hide();
      return;
    }
    action = "add";
    pending = s;
    btn.textContent = "Highlight";
    place(s.rect);
    btn.hidden = false;
  }

  // Mouse and keyboard show the button at once; touch selection only fires
  // selectionchange, so that path is debounced briefly.
  let timer;
  document.addEventListener("selectionchange", () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 40);
  });
  document.addEventListener("mouseup", () => setTimeout(refresh, 0));
  document.addEventListener("keyup", refresh);

  // Keep the selection alive while the button is pressed.
  btn.addEventListener("mousedown", (ev) => ev.preventDefault());
  btn.addEventListener("touchstart", (ev) => ev.preventDefault(), { passive: false });

  art.addEventListener("click", (ev) => {
    const m = ev.target.closest("mark[data-id]");
    if (!m || !getSelection().isCollapsed) return;
    action = "remove";
    target = m.dataset.id;
    btn.textContent = "Remove highlight";
    place(m.getBoundingClientRect());
    btn.hidden = false;
  });
  document.addEventListener("click", (ev) => {
    if (action === "remove" && !ev.target.closest("mark[data-id], .hl-btn")) hide();
  });

  // Wrap article text [start, end) in <mark>s, like the server does on load.
  // Offsets come from the original text nodes, which splitting never shifts.
  function wrap(start, end) {
    const walker = document.createTreeWalker(art, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let pos = 0;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n, at: pos });
      pos += n.data.length;
    }
    const marks = [];
    for (const { node, at } of nodes) {
      const from = Math.max(start - at, 0);
      const to = Math.min(end - at, node.data.length);
      if (to <= from || !node.data.slice(from, to).trim()) continue;
      const piece = node.splitText(from);
      piece.splitText(to - from);
      const mark = document.createElement("mark");
      mark.className = "hl";
      piece.replaceWith(mark);
      mark.appendChild(piece);
      marks.push(mark);
    }
    art.normalize();
    return marks;
  }

  // Paint first, save in the background. If saving fails, reload to show the
  // server's real state.
  async function add() {
    const { start, end, quote } = pending;
    hide();
    getSelection().removeAllRanges();
    const marks = wrap(start, end);
    try {
      const res = await fetch("/highlight/" + entry, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(quote),
      });
      if (!res.ok) throw new Error(String(res.status));
      const { id } = await res.json();
      for (const m of marks) m.dataset.id = id;
    } catch {
      location.reload();
    }
  }

  async function remove() {
    const id = target;
    hide();
    for (const m of document.querySelectorAll('mark[data-id="' + id + '"]')) m.replaceWith(...m.childNodes);
    art.normalize();
    const res = await fetch("/unhighlight/" + entry + "/" + id, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) location.reload();
  }

  btn.addEventListener("click", () => (action === "add" ? add() : remove()));
})();
</script>`;

export function readerPage(e: Entry, note: string, highlights: Highlight[], mode: MarkMode, nonce = ""): string {
  const admin = mode === MarkMode.Admin;
  const byline = [e.author, date(e.published || e.created_at)].filter(Boolean).map((s) => esc(s as string));
  const content = markHighlights(e.content ?? "<p>No content.</p>", highlights, mode);
  const body = `<p class="kicker">${esc(host(e.url))}</p>
<h1>${esc(e.title ?? e.url)}</h1>
<p class="meta byline">${byline.join(" · ")}</p>
<article${admin ? ` data-entry="${e.id}"` : ""}>${content}</article>
<p class="meta foot"><a href="${esc(e.url)}" rel="noreferrer">Read the original</a> · ${esc(note)}</p>`;

  return layout(e.title ?? e.url, body, admin ? highlightScript(nonce) : "", previewTags(e));
}

const adminScript = (nonce: string) => `<script nonce="${nonce}">
// Clipboard API first; old execCommand as fallback. Returns false if both fail.
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {}
  const t = document.createElement("textarea");
  t.value = text;
  t.style.position = "fixed";
  t.style.opacity = "0";
  document.body.appendChild(t);
  t.select();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch {}
  t.remove();
  return ok;
}
function flash(b, text) {
  const old = b.textContent;
  b.textContent = text;
  setTimeout(() => (b.textContent = old), 1500);
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.days) {
    const res = await fetch("/share/" + d.id + "?days=" + d.days, { method: "POST" });
    if (!res.ok) return flash(b, "Error " + res.status);
    location.reload();
  } else if (d.copy) {
    flash(b, (await copy(d.copy)) ? "Copied" : "Select the link");
  } else if (d.revoke) {
    const res = await fetch("/revoke/" + d.revoke, { method: "POST" });
    if (!res.ok) return flash(b, "Error " + res.status);
    location.reload();
  }
});
</script>`;

function linkRow(l: Link, baseUrl: string): string {
  const url = `${baseUrl}/s/${l.token}`;

  return `<div class="row"><span class="meta">Until ${shortDate(l.expiresAt)}</span>
<button data-copy="${esc(url)}">Copy</button>
<button data-revoke="${esc(l.token)}">Revoke</button></div>
<div class="row"><a class="meta link" href="${esc(url)}" target="_blank" rel="noreferrer">${esc(url)}</a></div>`;
}

export function listPage(entries: Entry[], links: Link[], baseUrl: string, nonce: string): string {
  const items = entries
    .map((e) => {
      const buttons = SHARE_DAYS.map((d) => `<button data-id="${e.id}" data-days="${d}">Link ${d}d</button>`).join("");
      const active = links.filter((l) => l.entryId === e.id).map((l) => linkRow(l, baseUrl)).join("");

      return `<li class="item"><a class="t" href="/a/${e.id}">${esc(e.title ?? e.url)}</a>
<div class="meta">${esc(host(e.url))} · ${date(e.created_at)}</div><div class="row">${buttons}</div>${active}</li>`;
    })
    .join("");
  const body = `<h1>Pages</h1><ul class="list">${items || "<li class='meta'>No saved pages.</li>"}</ul>`;

  return layout("Pages", body, adminScript(nonce));
}

export function messagePage(title: string, text: string): string {
  return layout(title, `<h1>${esc(title)}</h1><p class="meta">${esc(text)}</p>`);
}
