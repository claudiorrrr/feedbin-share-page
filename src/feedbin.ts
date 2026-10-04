import { extractPage } from "./extract";

const API = "https://api.feedbin.com/v2";
const PER_PAGE = 100;
const CACHE_MS = 60_000;
const PAGES_TITLE = /^pages$/i;
const PAGES_URL = /feedbin\.com\/pages/i;

export type Entry = {
  id: number;
  title: string | null;
  author: string | null;
  content: string | null;
  url: string;
  published: string;
  created_at: string;
  feed_id: number;
  extracted_content_url?: string;
};

type Subscription = { feed_id: number; title: string; feed_url: string };

type Cached<T> = { at: number; value: T };

export class Feedbin {
  private auth: string;
  private pagesFeedId: number | null;
  private listCache: Cached<Entry[]> | null = null;
  private entryCache = new Map<number, Cached<Entry>>();

  constructor(email: string, password: string, pagesFeedId: number | null) {
    this.auth = "Basic " + Buffer.from(`${email}:${password}`).toString("base64");
    this.pagesFeedId = pagesFeedId;
  }

  private async get<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Authorization: this.auth, Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Feedbin ${res.status} on ${url}`);
    }

    return res.json() as Promise<T>;
  }

  // Pages are entries of a special feed. Find it once, or use FEEDBIN_PAGES_FEED_ID.
  private async feedId(): Promise<number> {
    if (this.pagesFeedId) {
      return this.pagesFeedId;
    }

    const subs = await this.get<Subscription[]>(`${API}/subscriptions.json`);
    const match = subs.find((s) => PAGES_URL.test(s.feed_url) || PAGES_TITLE.test(s.title));
    if (!match) {
      const seen = subs.map((s) => `${s.feed_id}: ${s.title}`).join("\n");
      throw new Error(`Pages feed not found. Set FEEDBIN_PAGES_FEED_ID. Subscriptions:\n${seen}`);
    }

    this.pagesFeedId = match.feed_id;

    return match.feed_id;
  }

  async list(): Promise<Entry[]> {
    const cached = this.listCache;
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.value;
    }

    const id = await this.feedId();
    const value = await this.get<Entry[]>(`${API}/feeds/${id}/entries.json?per_page=${PER_PAGE}`);
    this.listCache = { at: Date.now(), value };

    return value;
  }

  async entry(id: number): Promise<Entry | null> {
    const cached = this.entryCache.get(id);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.value;
    }

    const feed = await this.feedId();
    const entry = await this.get<Entry>(`${API}/entries/${id}.json`);
    if (entry.feed_id !== feed) {
      return null;
    }

    if (!entry.content) {
      await this.fill(entry);
    }

    this.entryCache.set(id, { at: Date.now(), value: entry });

    return entry;
  }

  // Some pages arrive with empty content. Try Feedbin's extractor, then our
  // own. Never throws: the reader shows a link to the original instead.
  private async fill(entry: Entry): Promise<void> {
    if (entry.extracted_content_url) {
      const viaFeedbin = await this.get<{ content?: string }>(entry.extracted_content_url).catch(() => null);
      if (viaFeedbin?.content) {
        entry.content = viaFeedbin.content;

        return;
      }
    }

    const page = await extractPage(entry.url).catch(() => null);
    if (!page) {
      return;
    }

    entry.content = page.content;
    entry.author ??= page.author;
  }
}
