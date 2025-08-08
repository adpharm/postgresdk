// Generated. Do not edit.
export const RELATION_GRAPH = {
  "authors": {
    "books": {
      "from": "authors",
      "key": "books",
      "kind": "many",
      "target": "books"
    }
  },
  "book_tags": {
    "book": {
      "from": "book_tags",
      "key": "book",
      "kind": "one",
      "target": "books"
    },
    "tag": {
      "from": "book_tags",
      "key": "tag",
      "kind": "one",
      "target": "tags"
    }
  },
  "books": {
    "book_tags": {
      "from": "books",
      "key": "book_tags",
      "kind": "many",
      "target": "book_tags"
    },
    "author": {
      "from": "books",
      "key": "author",
      "kind": "one",
      "target": "authors"
    },
    "tags": {
      "from": "books",
      "key": "tags",
      "kind": "many",
      "target": "tags",
      "via": "book_tags"
    }
  },
  "tags": {
    "book_tags": {
      "from": "tags",
      "key": "book_tags",
      "kind": "many",
      "target": "book_tags"
    },
    "books": {
      "from": "tags",
      "key": "books",
      "kind": "many",
      "target": "books",
      "via": "book_tags"
    }
  }
} as const;
type TableName = keyof typeof RELATION_GRAPH;

export function buildWith(root: TableName, spec: any, maxDepth = 3) {
  return walk(root as string, spec, 0);
  function walk(table: string, s: any, depth: number): any {
    if (!s || depth >= maxDepth) return undefined;
    const rels: any = (RELATION_GRAPH as any)[table] || {};
    const out: any = {};
    for (const key of Object.keys(s)) {
      const rel = rels[key];
      if (!rel) throw new Error(`Unknown include key '${key}' on table '${table}'`);
      const v = s[key];
      if (v === true) out[key] = true;
      else if (v && typeof v === "object") {
        const child = "include" in v ? walk(rel.target, v.include, depth + 1) : undefined;
        out[key] = child ? { with: child } : true;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }
}

export const buildWithFor = (t: TableName) =>
  (spec?: any, depth = 3) => (spec ? buildWith(t, spec, depth) : undefined);
