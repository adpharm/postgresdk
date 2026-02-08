import type { Graph } from "./rel-classify";
import { pascal } from "./utils";

/**
 * Generate TypeScript types that resolve IncludeSpec to actual return types
 *
 * This allows automatic type inference:
 * const result = await sdk.captures.list({ include: { website: true } });
 * // result.data[0].website is typed as SelectWebsites
 */
export function emitIncludeResolver(graph: Graph, useJsExtensions?: boolean): string {
  const ext = useJsExtensions ? ".js" : "";

  let out = `/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Type helpers for automatic include inference.
 * These types transform IncludeSpec into the actual return type shape.
 */
`;

  // Generate imports
  const tables = Object.keys(graph);
  for (const table of tables) {
    out += `import type { Select${pascal(table)} } from "./types/${table}${ext}";\n`;
  }

  for (const table of tables) {
    out += `import type { ${pascal(table)}IncludeSpec } from "./include-spec${ext}";\n`;
  }

  out += "\n";

  // Generate resolver types for each table
  for (const table of tables) {
    const Type = pascal(table);
    const edges = graph[table] || {};
    const edgeEntries = Object.entries(edges);

    if (edgeEntries.length === 0) {
      // No relations - simple case
      out += `export type ${Type}WithIncludes<TInclude extends ${Type}IncludeSpec> = Select${Type};\n\n`;
      continue;
    }

    // Build conditional type for each relation
    out += `export type ${Type}WithIncludes<TInclude extends ${Type}IncludeSpec> =
  Select${Type} & {
    [K in keyof TInclude as TInclude[K] extends false | undefined ? never : K]:`;

    // Add conditional for each possible relation
    for (let i = 0; i < edgeEntries.length; i++) {
      const [relKey, edge] = edgeEntries[i];
      if (!relKey || !edge) continue;

      const targetType = pascal(edge.target);
      const isLast = i === edgeEntries.length - 1;

      out += `\n      K extends '${relKey}' ? `;

      if (edge.kind === "many") {
        // 1:N relation - returns array
        out += `(
        TInclude[K] extends { include: infer U extends ${targetType}IncludeSpec }
          ? Array<${targetType}WithIncludes<U>>
          : Select${targetType}[]
      )`;
      } else {
        // 1:1 relation - returns single object
        out += `(
        TInclude[K] extends { include: infer U extends ${targetType}IncludeSpec }
          ? ${targetType}WithIncludes<U>
          : Select${targetType}
      )`;
      }

      out += ` :${isLast ? '\n      never' : ''}`;
    }

    out += `
  };

`;
  }

  return out;
}
