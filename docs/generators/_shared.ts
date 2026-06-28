/**
 * Shared helpers for the docs generators.
 *
 * Generators turn postgresdk's own source (the single source of truth) into
 * Markdown reference pages. They are run from the repo root via the Taskfile
 * (`task docs:gen`). Each emitted page carries a banner so humans don't
 * hand-edit generated output.
 */
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";

/** Repo root (two levels up from docs/generators). */
export const ROOT = resolve(import.meta.dir, "../..");
/** postgresdk source directory — the source of truth for generated docs. */
export const SRC = resolve(ROOT, "src");
/** Destination for generated reference pages. */
export const REFERENCE_DIR = resolve(import.meta.dir, "../src/content/docs/reference");

/**
 * Visible banner inserted at the top of every generated page body. Tells humans
 * not to edit, and names the source + the command to regenerate.
 */
export function banner(source: string): string {
  return [
    ":::caution[Generated file — do not edit by hand]",
    `This page is generated from \`${source}\` by \`task docs:gen\`.`,
    "Edit the source and regenerate; manual changes are overwritten.",
    ":::",
    "",
  ].join("\n");
}

/** Convert JSDoc inline tags like `{@link Foo}` to plain text. */
function stripJsDocTags(s: string): string {
  return s.replace(/\{@link\s+([^}]+)\}/g, "$1");
}

/** Escape a string for safe use inside a Markdown table cell. */
export function mdCell(s: string): string {
  return stripJsDocTags(s)
    .replace(/\|/g, "\\|")
    .replace(/\r?\n+/g, " ")
    .trim();
}

/** Wrap a TypeScript type in inline code, escaping table-breaking pipes. */
export function typeCell(s: string): string {
  // Inside a table, `|` must be escaped even within an inline-code span.
  return "`" + s.replace(/\s+/g, " ").trim().replace(/\|/g, "\\|") + "`";
}

/** Build YAML frontmatter from a flat record. */
function frontmatter(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  return `---\n${body}\n---\n`;
}

/**
 * Write a generated reference page. `slug` is the file name without extension.
 */
export function writeReferencePage(opts: {
  slug: string;
  title: string;
  description: string;
  source: string;
  body: string;
}): string {
  mkdirSync(REFERENCE_DIR, { recursive: true });
  const path = resolve(REFERENCE_DIR, `${opts.slug}.md`);
  const content =
    frontmatter({ title: opts.title, description: opts.description }) +
    "\n" +
    banner(opts.source) +
    "\n" +
    opts.body.trimEnd() +
    "\n";
  writeFileSync(path, content, "utf-8");
  return path;
}
