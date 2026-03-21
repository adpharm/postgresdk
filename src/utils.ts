import { mkdir, writeFile, readFile, readdir, unlink } from "fs/promises";
import { dirname, join } from "path";
import { existsSync } from "fs";
import { createHash } from "crypto";

/** Returns true if the pg type is a vector/embedding type */
export function isVectorType(pgType: string): boolean {
  const t = pgType.toLowerCase();
  return t === "vector" || t === "halfvec" || t === "sparsevec" || t === "bit";
}

/** Returns true if the pg type is JSON/JSONB */
export function isJsonbType(pgType: string): boolean {
  const t = pgType.toLowerCase();
  return t === "json" || t === "jsonb";
}

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

/**
 * Recursively collect all subdirectory paths under `root`, including root itself.
 * Returns an empty array if `root` does not exist.
 */
export async function collectDirsRecursively(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];

  const dirs: string[] = [root];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sub = join(root, entry.name);
    dirs.push(...await collectDirsRecursively(sub));
  }
  return dirs;
}

/**
 * Find files in the given directories that are not in the set of generated paths,
 * without deleting them. Used to identify stale files before prompting for confirmation.
 */
export async function findStaleFiles(
  generatedPaths: Set<string>,
  dirsToScan: string[]
): Promise<string[]> {
  const stale: string[] = [];

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;

    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      // Only manage files we would generate (.ts, .md, .yml, .sh)
      if (!/\.(ts|md|yml|sh)$/.test(entry.name)) continue;

      const fullPath = join(dir, entry.name);
      if (!generatedPaths.has(fullPath)) {
        stale.push(fullPath);
      }
    }
  }

  return stale;
}

/**
 * Delete files in the given directories that are not in the set of generated paths.
 * Used to remove stale files for tables that no longer exist in the schema.
 */
export async function deleteStaleFiles(
  generatedPaths: Set<string>,
  dirsToScan: string[]
): Promise<{ deleted: number; filesDeleted: string[] }> {
  const stale = await findStaleFiles(generatedPaths, dirsToScan);

  for (const fullPath of stale) {
    await unlink(fullPath);
  }

  return { deleted: stale.length, filesDeleted: stale };
}
