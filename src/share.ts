import { randomBytes } from "node:crypto";
import { readJson, writeJson } from "./jsonfile";

const TOKEN_BYTES = 16;
const SECONDS_PER_DAY = 86_400;
const PRUNE_GRACE_DAYS = 30;

export type Link = { token: string; entryId: number; expiresAt: number };

function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function isExpired(link: Link): boolean {
  return link.expiresAt < now();
}

// Issued links live in a JSON file. A token is valid only while it is listed,
// so revoking is deleting the row.
export class LinkStore {
  private path: string;
  private links: Link[];

  constructor(path: string) {
    this.path = path;
    this.links = readJson<Link[]>(path, []);
  }

  private save(): void {
    writeJson(this.path, this.links);
  }

  // Expired links stay for a while so visitors see "expired", not "not found".
  private prune(): void {
    const cutoff = now() - PRUNE_GRACE_DAYS * SECONDS_PER_DAY;
    this.links = this.links.filter((l) => l.expiresAt > cutoff);
  }

  create(entryId: number, days: number): Link {
    const link = {
      token: randomBytes(TOKEN_BYTES).toString("base64url"),
      entryId,
      expiresAt: now() + days * SECONDS_PER_DAY,
    };
    this.prune();
    this.links.push(link);
    this.save();

    return link;
  }

  find(token: string): Link | undefined {
    return this.links.find((l) => l.token === token);
  }

  revoke(token: string): void {
    this.links = this.links.filter((l) => l.token !== token);
    this.save();
  }

  active(): Link[] {
    return this.links.filter((l) => !isExpired(l));
  }
}
