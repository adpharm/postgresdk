import type { Model, Table } from "./introspect";

export type Edge = {
  from: string;
  key: string;
  kind: "one" | "many";
  target: string;
  via?: string;
};

export type Graph = Record<string, Record<string, Edge>>;

const singular = (s: string) => (s.endsWith("s") ? s.slice(0, -1) : s);
const plural = (s: string) => (s.endsWith("s") ? s : s + "s");

export function buildGraph(model: Model): Graph {
  const graph: Graph = {};
  const tables: Table[] = Object.values(model.tables);

  // init nodes
  for (const t of tables) graph[t.name] = graph[t.name] ?? {};

  // 1) 1:N & 1:1 from FKs
  for (const child of tables) {
    for (const fk of child.fks) {
      const parent = tables.find((t) => t.name === fk.toTable);
      if (!parent) continue;

      // cache nodes so TS knows they're not undefined
      const childNode = (graph[child.name] ??= {});
      const parentNode = (graph[parent.name] ??= {});

      const upKey = singular(parent.name);
      const downKey = plural(child.name);

      if (!(upKey in childNode)) {
        childNode[upKey] = { from: child.name, key: upKey, kind: "one", target: parent.name };
      }
      if (!(downKey in parentNode)) {
        parentNode[downKey] = { from: parent.name, key: downKey, kind: "many", target: child.name };
      }
    }
  }

  // 2) M:N via junction (two FKs)
  for (const j of tables) {
    if ((j.fks?.length ?? 0) !== 2) continue;
    const [fkA, fkB] = j.fks;
    if (!fkA || !fkB) continue;

    const A = fkA.toTable;
    const B = fkB.toTable;
    if (!A || !B || A === B) continue;

    const aNode = (graph[A] ??= {});
    const bNode = (graph[B] ??= {});

    const aKey = plural(B);
    const bKey = plural(A);

    if (!(aKey in aNode)) {
      aNode[aKey] = { from: A, key: aKey, kind: "many", target: B, via: j.name };
    }
    if (!(bKey in bNode)) {
      bNode[bKey] = { from: B, key: bKey, kind: "many", target: A, via: j.name };
    }
  }

  return graph;
}
