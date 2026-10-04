import { randomBytes } from "node:crypto";
import { readJson, writeJson } from "./jsonfile";

const ID_BYTES = 6;

// A highlight is stored as a text quote (W3C TextQuoteSelector): the selected
// text plus a little text on each side. It is found again by searching, so it
// survives small changes in how the article is extracted.
export type Highlight = { id: string; exact: string; prefix: string; suffix: string };

type Db = Record<string, Highlight[]>;

export class HighlightStore {
  private path: string;
  private db: Db;

  constructor(path: string) {
    this.path = path;
    this.db = readJson<Db>(path, {});
  }

  list(entryId: number): Highlight[] {
    return this.db[entryId] ?? [];
  }

  add(entryId: number, quote: Omit<Highlight, "id">): Highlight {
    const highlight = { id: randomBytes(ID_BYTES).toString("hex"), ...quote };
    this.db[entryId] = [...this.list(entryId), highlight];
    writeJson(this.path, this.db);

    return highlight;
  }

  remove(entryId: number, id: string): void {
    this.db[entryId] = this.list(entryId).filter((h) => h.id !== id);
    writeJson(this.path, this.db);
  }
}
