---
title: Client SDK usage
description: CRUD, eager-loading includes, typed include methods, and atomic transactions with the generated SDK.
sidebar:
  order: 2
---

The generated client SDK gives every table a typed set of operations. Initialize it with your
API base URL (and auth, if configured).

```ts
import { SDK } from "./api/client"; // or "./src/sdk" when pulled — see SDK distribution

const sdk = new SDK({ baseUrl: "http://localhost:3000" });
```

## CRUD

```ts
const user = await sdk.users.create({ name: "Bob", email: "bob@example.com" });

const one = await sdk.users.getByPk("user-id");  // primary keys are strings; null if not found
const { data } = await sdk.users.list();         // list() returns a paginated result

const updated = await sdk.users.update("user-id", { name: "Robert" }); // null if not found

// Upsert (Prisma-style); `where` must target a unique constraint
const upserted = await sdk.users.upsert({
  where: { email: "alice@example.com" },
  create: { email: "alice@example.com", name: "Alice" },
  update: { name: "Alice Updated" },
});

await sdk.users.hardDelete("user-id");   // permanent
// await sdk.users.softDelete("user-id"); // when softDeleteColumn is configured
```

`getByPk`, `update`, `softDelete`, and `hardDelete` return `null` when no row matches the id (the
underlying request 404s). Narrow before using the result.

## Soft vs hard delete

When a [`softDeleteColumn`](/reference/configuration/#deleteconfig) is configured:

- `softDelete(id)` sets that column (e.g. `deleted_at = NOW()`); `hardDelete(id)` permanently deletes
  (unless [`exposeHardDelete: false`](/reference/configuration/#deleteconfig)).
- Soft-deleted rows are **automatically hidden** from `list()` and `getByPk()`.
- Pass `includeSoftDeleted: true` to include them:

```ts
const { data } = await sdk.users.list({ includeSoftDeleted: true });
```

Without a `softDeleteColumn`, only `hardDelete` exists.

## Relationships & eager loading

Use `include` to load related rows. Return types are inferred automatically — no casts.

```ts
const { data: authors } = await sdk.authors.list({ include: { books: true } });
// authors[0].books is typed as SelectBooks[]

// Nested includes
const { data } = await sdk.authors.list({
  include: { books: { tags: true } },
});
// data[0].books[0].tags is typed as SelectTags[]
```

### Typed include methods

For common patterns the SDK also generates `listWith*` / `getByPkWith*` helpers with per-relation
options. How deep these go is controlled by [`includeMethodsDepth`](/reference/configuration/#config).

```ts
const top = await sdk.authors.listWithBooks({
  limit: 10,
  booksInclude: { orderBy: "published_at", order: "desc", limit: 5 },
});

const author = await sdk.authors.getByPkWithBooks("author-id", {
  booksInclude: { orderBy: "published_at", limit: 3 },
});
```

## Atomic transactions

Build operations lazily with the `$`-prefixed methods, then run them in one transaction. All ops
are Zod-validated **before** `BEGIN`, and any failure rolls everything back.

```ts
const [order, updatedUser] = await sdk.$transaction([
  sdk.orders.$create({ user_id: user.id, total: 99 }),
  sdk.users.$update(user.id, { last_order_at: new Date().toISOString() }),
]);
// inferred as [SelectOrders, SelectUsers | null]
```

`$create`, `$update`, `$upsert`, `$softDelete`, and `$hardDelete` are the lazy builders. The whole
batch posts to `POST /v1/transaction`. On failure the thrown error carries a `.failedAt` index and,
for validation failures, an `.issues` array (the Zod issues).

```ts
try {
  await sdk.$transaction([
    sdk.inventory.$update(itemId, { stock: newStock }),
    sdk.orders.$create({ item_id: itemId, qty: 1 }),
  ]);
} catch (err: any) {
  console.error(`failed at op ${err.failedAt}:`, err.message, err.issues);
}
```

## Errors & response shapes

- Non-2xx responses throw `Error("<METHOD> <path> failed: <status> <body>")`.
- `404` is special-cased to return `null` (so `getByPk`/`update`/`softDelete`/`hardDelete` resolve to
  `null` rather than throwing when the row is absent).
- `list()` always returns the [paginated shape](/guides/querying/#pagination).

## Generated types & enums

Each table emits `Select<Table>`, `Insert<Table>`, and `Update<Table>` types, plus Zod schemas. Import
paths depend on your `outDir`:

```ts
import type { SelectUsers, InsertUsers, UpdateUsers } from "./api/client/types/users";
import type { PaginatedResponse } from "./api/client/types/shared";
import { InsertUsersSchema, UpdateUsersSchema } from "./api/client/zod/users";
```

Postgres **enum** columns become TypeScript string-literal unions (and `z.enum(...)` in the Zod
schemas) — e.g. a `status` enum of `active|inactive` is typed as `"active" | "inactive"`, not a bare
`string`.

For filtering, sorting, selection, and search see [Querying & pagination](/guides/querying/). For the
exact methods, types, and endpoints generated for *your* schema, see the
[Generated API example](/reference/generated-api-example/).
