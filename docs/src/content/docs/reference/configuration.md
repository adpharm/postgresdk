---
title: "Configuration reference"
description: "Every postgresdk.config.ts option, generated from the Config type."
---

:::caution[Generated file — do not edit by hand]
This page is generated from `src/types.ts` by `task docs:gen`.
Edit the source and regenerate; manual changes are overwritten.
:::


postgresdk reads a `postgresdk.config.ts` that default-exports a [`Config`](#config) object.
Use `postgresdk init` to scaffold one.

```ts
import type { Config } from "postgresdk";

export default {
  connectionString: process.env.DATABASE_URL!,
  outDir: { client: "./api/client", server: "./api/server" },
} satisfies Config;
```

## `Config`

The default export of your `postgresdk.config.ts`. Only `connectionString` is required.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `connectionString` | `string` | — | Postgres connection string used to introspect the schema (e.g. `"postgres://user:pass@host:5432/db"`). Read it from an env var in real configs. |
| `schema?` | `string` | `"public"` | Postgres schema to introspect. |
| `outDir?` | `string \| { client: string; server: string }` | `{ client: "./api/client", server: "./api/server" }` | Where generated code is written. A single string is used for both server and client (the client SDK lands in an `sdk/` subdirectory); an object sets each separately. |
| `delete?` | `DeleteConfig` | — | Soft/hard delete behavior. |
| `numericMode?` | `"string" \| "number" \| "auto"` | `"auto"` | How numeric columns are typed. `"auto"` maps `int2`/`int4` → `number` and `int8`/`numeric` → `string` (to avoid precision loss). |
| `includeMethodsDepth?` | `number` | `2` | How deep to generate eager-loading `include` helper methods. |
| `skipJunctionTables?` | `boolean` | `true` | Skip junction (M:N) tables when generating include methods. |
| `serverFramework?` | `"hono" \| "express" \| "fastify"` | `"hono"` | Server framework for the generated routes. Only `"hono"` is implemented today; `"express"`/`"fastify"` are reserved. |
| `apiPathPrefix?` | `string` | `"/v1"` | Path prefix for the generated table routes. |
| `maxLimit?` | `number` | `1000` | Maximum allowed value for the `limit` parameter in list operations. Set to `0` to disable the cap. |
| `auth?` | `AuthConfigInput` | — | API authentication. Omit for no auth. Accepts the API-key shorthand or a full AuthConfig. |
| `pullToken?` | `string` | — | Token protecting the `/_psdk/*` SDK-distribution endpoints. Use the `"env:VAR_NAME"` form. If unset, those endpoints are public. |
| `pull?` | `PullConfig` | — | Pull configuration for client repos that consume a generated SDK over HTTP. |
| `useJsExtensions?` | `boolean` | `false` | Emit `.js` import extensions in generated server code (needed for Vercel Edge). |
| `useJsExtensionsClient?` | `boolean` | `false` | Emit `.js` import extensions in generated client SDK code (for certain bundlers/runtimes). |
| `clean?` | `boolean` | `true` | Delete generated files for tables/items no longer present in the schema. |
| `tests?` | `object — see below` | — | Generated test-suite configuration. |

## `Config.tests`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `generate?` | `boolean` | `false` | Generate test files. |
| `output?` | `string` | `"./api/tests"` | Output directory for generated tests. |
| `framework?` | `"vitest" \| "jest" \| "bun"` | `"vitest"` | Test framework for the generated tests. |

## `DeleteConfig`

Shape of `Config.delete`.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `softDeleteColumn?` | `string` | — | Column name for soft deletes (e.g. `"deleted_at"`). Absence means hard deletes only. |
| `exposeHardDelete?` | `boolean` | `true` | Whether to also expose `hardDelete` when soft delete is configured. |
| `softDeleteColumnOverrides?` | `Record<string, string \| null>` | — | Per-table overrides. Use `null` to disable soft delete for a specific table. |

## `AuthConfig`

Full shape of `Config.auth`. An API-key shorthand (`{ apiKey: "..." }`) is also accepted and normalized to this.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `apiKeyHeader?` | `string` | `"x-api-key"` | Header to read the API key from. |
| `apiKeys?` | `string[]` | — | Accepted API keys. A value may use the `"env:MY_KEY_LIST"` form to read a comma-separated list from the environment. |
| `jwt?` | `object — see below` | — | JWT (HS256) verification config. Its presence selects the JWT auth strategy. |

## `AuthConfig.jwt`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `services` | `object — see below` | — | — |
| `audience?` | `string` | — | When set, validates the JWT `aud` claim. |

## `AuthConfig.jwt.services`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `issuer` | `string` | — | Identifies the calling service. Must match the JWT `iss` claim. |
| `secret` | `string` | — | Signing secret. MUST use the `"env:VAR_NAME"` form (e.g. `"env:JWT_SECRET"`). SECURITY: never inline `process.env.X` or a literal secret here. The generator rewrites `"env:JWT_SECRET"` to `process.env.JWT_SECRET` in the generated code. |

## `PullConfig`

Shape of `Config.pull`, used by client repos that pull a generated SDK over HTTP.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | `string` | — | API URL to pull the SDK from. |
| `output?` | `string` | `"./src/sdk"` | Output directory for the pulled SDK. |
| `pullToken?` | `string` | — | Auth token for the `/_psdk/*` endpoints. Use the `"env:VAR_NAME"` form. |
