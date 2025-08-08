import type { Model } from "./introspect";

export type Edge = { from: string; key: string; kind: "one" | "many"; target: string; via?: string };
export type Graph = Record<string, Record<string, Edge>>;

export function buildGraph(m: Model): Graph {
  const graph: Graph = {};
  for (const t of Object.values(m.tables)) graph[t.name] = {};

  // 1:N / 1:1
  for (const child of Object.values(m.tables)) {
    for (const fk of child.fks) {
      const parent = m.tables[fk.toTable];
      const isUniqueOnFk = child.uniques.some(
        (u) => u.length === fk.from.length && u.every((c) => fk.from.includes(c))
      );

      // child -> parent (one)
      const upKey = singular(parent.name);
      graph[child.name][upKey] = { from: child.name, key: upKey, kind: "one", target: parent.name };

      // parent -> child (many or one)
      const downKey = plural(child.name);
      graph[parent.name][downKey] = {
        from: parent.name,
        key: downKey,
        kind: isUniqueOnFk ? "one" : "many",
        target: child.name,
      };
    }
  }

  // M:N via junction
  for (const j of Object.values(m.tables).filter((t) => t.isJunction)) {
    const [fkA, fkB] = j.fks;
    if (!fkA || !fkB) continue;
    const A = fkA.toTable,
      B = fkB.toTable;
    graph[A][plural(B)] = { from: A, key: plural(B), kind: "many", target: B, via: j.name };
    graph[B][plural(A)] = { from: B, key: plural(A), kind: "many", target: A, via: j.name };
  }

  return graph;
}

// naive inflectors (replace with pluralize lib if needed)
const plural = (s: string) => (s.endsWith("s") ? s : `${s}s`);
const singular = (s: string) => (s.endsWith("s") ? s.slice(0, -1) : s);
