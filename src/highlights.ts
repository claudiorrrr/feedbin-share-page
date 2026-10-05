import { randomBytes } from "node:crypto";
import { readJson, writeJson } from "./jsonfile";

const ID_BYTES = 6;

// A highlight is stored as a text quote (W3C TextQuoteSelector): the selected
// text plus a little text on each side. It is found again by searching, so it
// survives small changes in how the article is extracted.
export type Highlight = { id: string; exact: string; prefix: string; suffix: string };

// A comment is a quote with a note. Kept apart from highlights: separate
// store, separate look.
export type Comment = Highlight & { text: string };

// Also stores comments: HighlightStore<Comment>.
export class HighlightStore<T extends Highlight = Highlight> {
  private path: string;
  private db: Record<string, T[]>;

  constructor(path: string) {
    this.path = path;
    this.db = readJson<Record<string, T[]>>(path, {});
  }

  list(entryId: number): T[] {
    return this.db[entryId] ?? [];
  }

  add(entryId: number, quote: Omit<T, "id">): T {
    const highlight = { id: randomBytes(ID_BYTES).toString("hex"), ...quote } as T;
    this.db[entryId] = [...this.list(entryId), highlight];
    writeJson(this.path, this.db);

    return highlight;
  }

  remove(entryId: number, id: string): void {
    this.db[entryId] = this.list(entryId).filter((h) => h.id !== id);
    writeJson(this.path, this.db);
  }
}
