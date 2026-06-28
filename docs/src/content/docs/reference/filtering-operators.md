---
title: "Filtering & WHERE operators"
description: "Every where-clause operator, generated from postgresdk's emitWhereTypes()."
---

:::caution[Generated file — do not edit by hand]
This page is generated from `src/emit-where-types.ts (via `emitWhereTypes()`)` by `task docs:gen`.
Edit the source and regenerate; manual changes are overwritten.
:::


List operations accept a type-safe `where` clause. A field maps either to a direct value
(equality) or to an **operator object**. Operators are validated at compile time — e.g. string-only
operators reject non-string columns, and JSONB operators are only offered on `object`/`unknown` columns.

```ts
await sdk.users.list({
  where: {
    status: "active",                 // direct value → equality
    age: { $gte: 18, $lt: 65 },       // operator object
    name: { $ilike: "%alice%" },      // case-insensitive LIKE
    $or: [{ role: "admin" }, { role: "owner" }],
  },
});
```

## Field operators

Use these inside an operator object on a single column.

| Operator | Description |
| --- | --- |
| `$eq` | Equal to |
| `$ne` | Not equal to |
| `$gt` | Greater than |
| `$gte` | Greater than or equal to |
| `$lt` | Less than |
| `$lte` | Less than or equal to |
| `$in` | In array |
| `$nin` | Not in array |
| `$like` | LIKE pattern match (strings only) |
| `$ilike` | Case-insensitive LIKE (strings only) |
| `$similarity` | Trigram similarity match - "col" % value (pg_trgm required, uses similarity_threshold GUC) |
| `$wordSimilarity` | Word trigram similarity match - value <% "col" (pg_trgm required) |
| `$strictWordSimilarity` | Strict word trigram similarity match - value <<% "col" (pg_trgm required) |
| `$is` | IS NULL |
| `$isNot` | IS NOT NULL |
| `$jsonbContains` | JSONB contains (@>) - check if column contains the specified JSON structure |
| `$jsonbContainedBy` | JSONB contained by (<@) - check if column is contained by the specified JSON |
| `$jsonbHasKey` | JSONB has key (?) - check if top-level key exists |
| `$jsonbHasAnyKeys` | JSONB has any keys (?\|) - check if any of the specified keys exist |
| `$jsonbHasAllKeys` | JSONB has all keys (?&) - check if all of the specified keys exist |
| `$jsonbPath` | JSONB path query - query nested values. For multiple paths on same column, use $and |

## Logical operators

Combine field conditions. `$or`/`$and` nest up to two levels.

| Operator | Description |
| --- | --- |
| `$or` | OR - at least one condition must be true |
| `$and` | AND - all conditions must be true (alternative to implicit root-level AND) |

## JSONB path query

Shape of the `$jsonbPath` operator value.

| Operator | Description |
| --- | --- |
| `path` | Array of keys to traverse (e.g., ['user', 'preferences', 'theme']) |
| `operator` | Operator to apply to the value at the path (defaults to '$eq') |
| `value` | Value to compare against |
