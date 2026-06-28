/**
 * Generates the CLI reference by running the real `postgresdk help` and capturing
 * its output. The help text in `src/cli.ts` is the single source of truth, so the
 * page can never drift from the actual CLI.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { SRC, writeReferencePage, mdCell } from "./_shared";

const cli = resolve(SRC, "cli.ts");
const help = execFileSync("bun", [cli, "help"], { encoding: "utf-8" }).trim();

/** Parse the `Commands:` block into rows of [name, description]. */
function parseCommands(text: string): Array<[string, string]> {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^Commands:/.test(l));
  if (start === -1) return [];
  const rows: Array<[string, string]> = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (!line.trim()) break; // blank line ends the section
    // Name is everything up to the 2-space gap (so multi-word names like
    // "generate, gen" are captured, not truncated at the first space).
    const m = line.match(/^\s+(.+?)\s{2,}(.+?)\s*$/);
    if (m) rows.push([m[1]!, m[2]!]);
  }
  return rows;
}

const commands = parseCommands(help);

const commandTable = commands.length
  ? [
      "| Command | Description |",
      "| --- | --- |",
      ...commands.map(([name, desc]) => `| \`${name}\` | ${mdCell(desc)} |`),
      "",
    ].join("\n")
  : "";

const body = `
\`postgresdk\` is a code generator: it introspects a PostgreSQL schema and emits a
typed Hono API server and TypeScript client SDK. Run it with \`bunx postgresdk@latest <command>\`
(or \`npx\` / \`pnpm dlx\`).

## Commands

${commandTable}

## Full help output

The following is the verbatim output of \`postgresdk help\`:

\`\`\`text
${help}
\`\`\`
`;

const path = writeReferencePage({
  slug: "cli",
  title: "CLI reference",
  description: "Every postgresdk CLI command and option, captured from `postgresdk help`.",
  source: "src/cli.ts (via `postgresdk help`)",
  body,
});

console.log(`✓ CLI reference   → ${path}`);
