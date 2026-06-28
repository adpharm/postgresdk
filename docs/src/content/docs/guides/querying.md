---
title: Querying & pagination
description: Filter with type-safe where clauses, sort, paginate, and use vector & trigram search.
sidebar:
  order: 3
---

`list()` accepts `where`, `orderBy`/`order`, `limit`, and `offset`, and returns pagination
metadata. The full operator set lives in [Filtering & WHERE operators](/reference/filtering-operators/).

## Filtering

A field maps to a direct value (equality) or an operator object. Operators are checked at compile
time against the column's type.

```ts
const { data } = await sdk.users.list({
  where: {
    status: "active",
    age: { $gte: 18, $lt: 65 },
    name: { $ilike: "%alice%" },
    $or: [{ role: "admin" }, { role: "owner" }],
  },
});
```

## Sorting

```ts
// single column
await sdk.users.list({ orderBy: "created_at", order: "desc" });

// multi-column
await sdk.users.list({
  orderBy: ["status", "created_at"],
  order: ["asc", "desc"], // or a single direction applied to all
});
```

## Pagination

```ts
const result = await sdk.users.list({ where: { status: "active" }, limit: 20, offset: 40 });

result.data;     // records
result.total;    // total matching rows
result.limit;    // page size used (undefined when no limit was given)
result.offset;   // offset used
result.hasMore;  // more pages available (false when no limit)
```

Omitting `limit` returns all matching rows, capped by
[`maxLimit`](/reference/configuration/#config) (default `1000`).

## Vector & trigram search

When your schema uses `pgvector` / `pg_trgm`, the generator emits the matching capabilities:

- **Trigram** similarity is exposed as `where` operators — `$similarity`, `$wordSimilarity`,
  `$strictWordSimilarity` (string columns; requires `pg_trgm`). See
  [Filtering & WHERE operators](/reference/filtering-operators/).
- **Vector** similarity search (pgvector) is generated per vector column.

For the exact search methods and signatures emitted for your schema, check the generated
`CONTRACT.md` — see the [Generated API example](/reference/generated-api-example/).
