import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) {
    return fallback;
  }

  return JSON.parse(readFileSync(path, "utf8")) as T;
}

// Write to a temp file then rename, so a crash never leaves half a file.
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
}
