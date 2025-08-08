import { mkdir, writeFile } from "fs/promises";
import { dirname } from "path";

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

export async function ensureDirs(dirs: string[]) {
  for (const d of dirs) await mkdir(d, { recursive: true });
}
