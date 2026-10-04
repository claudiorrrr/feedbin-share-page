import type { Entry } from "./feedbin";
import { readJson, writeJson } from "./jsonfile";

// Marks entries added by URL. Feedbin feed ids are always positive.
export const MANUAL_FEED_ID = 0;

type NewPage = { url: string; title: string | null; author: string | null; content: string };

// Pages added by URL instead of coming from Feedbin. The content is a
// snapshot taken on add, so shared links survive the original going away.
export class ManualStore {
  private path: string;
  private entries: Entry[];

  constructor(path: string) {
    this.path = path;
    this.entries = readJson<Entry[]>(path, []);
  }

  private save(): void {
    writeJson(this.path, this.entries);
  }

  list(): Entry[] {
    return this.entries;
  }

  find(id: number): Entry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  // The id is the creation time in ms: far above any Feedbin entry id.
  add(page: NewPage): Entry {
    let id = Date.now();
    while (this.find(id)) {
      id++;
    }

    const now = new Date().toISOString();
    const entry: Entry = { ...page, id, published: now, created_at: now, feed_id: MANUAL_FEED_ID };
    this.entries.push(entry);
    this.save();

    return entry;
  }

  remove(id: number): void {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.save();
  }
}
