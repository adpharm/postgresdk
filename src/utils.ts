import { mkdir, writeFile, readFile } from "fs/promises";
import { dirname } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";

export const pascal = (s: string) =>
  s
    .split(/[_\s-]+/)
    .map((w) => (w?.[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .join("");

export async function writeFiles(files: Array<{ path: string; content: string }>) {
  for (const f of files) {
    await mkdir(dirname(f.path), { recursive: true });
    await writeFile(f.path, f.content, "utf-8");
  }
}

/**
 * Write files only if content has changed (idempotent)
 * Returns the count of files actually written
 */
export async function writeFilesIfChanged(
  files: Array<{ path: string; content: string }>
): Promise<{ written: number; unchanged: number; filesWritten: string[] }> {
  let written = 0;
  let unchanged = 0;
  const filesWritten: string[] = [];

  for (const f of files) {
    await mkdir(dirname(f.path), { recursive: true });

    // Check if file exists and content is the same
    if (existsSync(f.path)) {
      const existing = await readFile(f.path, "utf-8");
      if (existing === f.content) {
        unchanged++;
        continue;
      }
    }

    await writeFile(f.path, f.content, "utf-8");
    written++;
    filesWritten.push(f.path);
  }

  return { written, unchanged, filesWritten };
}

/**
 * Compute hash of a string
 */
export function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function ensureDirs(dirs: string[]) {
  for (const d of dirs) await mkdir(d, { recursive: true });
}
