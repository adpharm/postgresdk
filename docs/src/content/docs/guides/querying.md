---
title: Querying & pagination
description: Filter, sort, paginate, select fields, DISTINCT ON, and run vector & trigram search with the generated SDK.
sidebar:
  order: 3
---

`list()` accepts `where`, `orderBy`/`order`, `limit`, `offset`, `select`/`exclude`, `distinctOn`,
and (when your schema supports them) `vector` / `trigram`. It returns the records plus pagination
metadata. The full operator set lives in [Filtering & WHERE operators](/reference/filtering-operators/).

## Filtering

A field maps to a direct value (equality) or an operator object. Root-level keys are AND'd; use
`$or`/`$and` for explicit logic (two nesting levels max). Operators are checked at compile time
against the column's type.

```ts
const { data } = await sdk.users.list({
  where: {
    status: { $in: ["active", "pending"] },
    age: { $gte: 18, $lt: 65 },
    name: { $ilike: "%alice%" },
    deleted_at: { $is: null },
    $or: [{ role: "admin" }, { role: "owner" }],
  },
});
```

## Sorting

```ts
// single column
await sdk.users.list({ orderBy: "created_at", order: "desc" });

// multi-column (per-column direction, positionally matched to orderBy)
await sdk.users.list({
  orderBy: ["status", "created_at"],
  order: ["asc", "desc"], // or a single direction applied to all columns
});
```

## DISTINCT ON

Return one row per distinct value of the given column(s). Pair it with `orderBy` to control which
row wins. When you order by a column outside the `distinctOn` set, the SDK wraps the query in a
subquery so the ordering still applies.

```ts
// latest event per user
const latestPerUser = await sdk.events.list({
  distinctOn: "user_id",
  orderBy: "created_at",
  order: "desc",
});

// multiple distinct columns
await sdk.events.list({ distinctOn: ["user_id", "type"] });
```

## Selecting fields

Return a subset of columns with `select`, or everything except some with `exclude`. These also work
on single-record operations and on included relations.

```ts
// only these columns
await sdk.users.list({ select: ["id", "email", "name"] });

// all columns except these
await sdk.users.list({ exclude: ["password_hash", "secret_token"] });

// single-record operations accept the same options
await sdk.users.getByPk("user-id", { select: ["id", "name"] });
await sdk.users.create(data, { select: ["id", "email"] });
await sdk.users.update("user-id", patch, { exclude: ["updated_at"] });

// scope select/exclude to an included relation
await sdk.authors.list({
  select: ["id", "name"],
  include: { books: { select: ["id", "title"], orderBy: "published_at", limit: 5 } },
});
```

:::caution
`select` and `exclude` are mutually exclusive on the same operation — passing both throws at
runtime. Pick one.
:::

## Pagination

```ts
const result = await sdk.users.list({ where: { status: "active" }, limit: 20, offset: 40 });
```

Every `list()` returns this shape:

```ts
{
  data: T[];        // the records
  total: number;    // total matching rows (respects `where`)
  limit?: number;   // page size used — absent when no limit was given
  offset: number;   // offset used
  hasMore: boolean; // more pages available (false when no limit)
}
```

Omitting `limit` returns all matching rows, capped by
[`maxLimit`](/reference/configuration/#config) (default `1000`).

Soft-deleted rows are excluded from `list()`/`getByPk()` automatically — see
[Soft vs hard delete](/guides/client-usage/#soft-vs-hard-delete) for `includeSoftDeleted`.

## Vector search (pgvector)

For tables with a `vector` column, pass a `vector` block to `list()`. Matching rows come back sorted
by distance, each with an added `_distance` field. Combine it with a normal `where` clause.

```ts
const results = await sdk.video_sections.list({
  vector: {
    field: "vision_embedding", // the vector column
    query: embeddingArray,     // number[] — your query embedding
    metric: "cosine",          // "cosine" | "l2" | "inner"
    maxDistance: 0.5,          // optional cutoff
  },
  where: { status: "published" },
  limit: 10,
});
results.data[0]._distance; // number
```

## Trigram search (pg_trgm)

For typo-tolerant text search, pass a `trigram` block. Matching rows come back with an added
`_similarity` field.

```ts
const results = await sdk.books.list({
  trigram: {
    field: "title",
    query: "postgrs",       // typo-tolerant
    metric: "similarity",   // "similarity" | "wordSimilarity" | "strictWordSimilarity"
    threshold: 0.3,         // minimum score, 0–1
  },
  limit: 10,
});
results.data[0]._similarity; // number
```

Multi-field variants:

```ts
// best score across fields
await sdk.books.list({
  trigram: { fields: ["title", "subtitle"], strategy: "greatest", query: "postgrs" },
});

// weighted fields
await sdk.books.list({
  trigram: {
    fields: [{ field: "title", weight: 2 }, { field: "subtitle", weight: 1 }],
    query: "postgrs",
  },
});
```

:::note
`vector` and `trigram` are mutually exclusive on a single `list()` call. The string WHERE operators
`$similarity` / `$wordSimilarity` / `$strictWordSimilarity` (see
[Filtering & WHERE operators](/reference/filtering-operators/)) are a lighter-weight alternative for
inline trigram filtering.
:::
