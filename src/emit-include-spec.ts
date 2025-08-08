/* emit-include-spec.ts — safe iteration */
import type { Graph } from "./rel-classify";

export function emitIncludeSpec(graph: Graph) {
  let out = `/* Generated. Do not edit. */\n`;

  const tables = Object.keys(graph);
  for (const table of tables) {
    const rels = graph[table] ?? {};
    const entries = Object.entries(rels);

    out += `export type ${toPascal(table)}IncludeSpec = {\n`;
    for (const [relKey, edge] of entries) {
      if (edge.kind === "many") {
        out += `  ${relKey}?: boolean | { include?: ${toPascal(
          edge.target
        )}IncludeSpec; limit?: number; offset?: number; };\n`;
      } else {
        out += `  ${relKey}?: boolean | ${toPascal(edge.target)}IncludeSpec;\n`;
      }
    }
    out += `};\n\n`;
  }

  return out;
}

function toPascal(s: string) {
  return s
    .split(/[_\s-]+/)
    .map((w) => (w?.[0] ? w[0].toUpperCase() + w.slice(1) : ""))
    .join("");
}
