# postgresdk

> ⚠️ **Active Development**: This project is under active development and is not yet stable for production use. APIs and features may change without notice.

Generate a typed server/client SDK from your PostgreSQL database schema.

postgresdk introspects your Postgres schema and generates two things:

- A **Hono API server** — typed routes, Zod validation, auth middleware, soft/hard delete, vector & trigram search.
- A **TypeScript client SDK** — typed CRUD, eager-loading `include`s, atomic transactions, type-safe `where` filtering, and pagination.

Regenerate any time your schema changes. No hand-written glue, no drift.

## 📚 Documentation

Full documentation lives at **<https://docs.postgresdk.com>**.

The docs are also published for LLMs / agents (read verbatim):

- [`/llms.txt`](https://docs.postgresdk.com/llms.txt) — index + summary
- [`/llms-full.txt`](https://docs.postgresdk.com/llms-full.txt) — the entire docs as one file
- [`/llms-small.txt`](https://docs.postgresdk.com/llms-small.txt) — trimmed bundle for smaller contexts

Highlights:

- [Quick start](https://docs.postgresdk.com/getting-started/quick-start/)
- [CLI reference](https://docs.postgresdk.com/reference/cli/) *(generated from the CLI)*
- [Configuration reference](https://docs.postgresdk.com/reference/configuration/) *(generated from the `Config` type)*
- [Filtering & WHERE operators](https://docs.postgresdk.com/reference/filtering-operators/) *(generated from the source)*
- [Generated API example](https://docs.postgresdk.com/reference/generated-api-example/) *(a real `CONTRACT.md`)*

## What it looks like

```typescript
// ✨ Fully typed client with autocomplete
const user = await sdk.users.create({ name: "Alice", email: "alice@example.com" });

// 🔗 Automatic relationship loading
const { data } = await sdk.users.list({ include: { posts: true } });
// data[0].posts is fully typed Post[]

// 🎯 Advanced filtering with type safety
const filtered = await sdk.users.list({
  where: { email: { $ilike: "%@company.com" }, status: "active" },
});
```

## Features

- 🚀 **Instant SDK generation** — point at your database, get a complete SDK
- 🔒 **Type safety** — full TypeScript types derived from your schema (including enums)
- ✅ **Runtime validation** — Zod schemas for requests/responses
- 🔗 **Smart relationships** — 1:N and M:N with eager loading
- 🔍 **Vector & trigram search** — pgvector and pg_trgm support
- ⚡ **Atomic transactions** — `sdk.$transaction([...])`
- 🔐 **Built-in auth** — API key and JWT
- 🎯 **Sensible defaults** — only `connectionString` is required

## Quick start

```bash
bunx postgresdk@latest init       # create postgresdk.config.ts
bunx postgresdk@latest generate   # introspect + generate (alias: gen)
```

```typescript
// server
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const app = new Hono();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
app.route("/", createRouter({ pg }));
serve({ fetch: app.fetch, port: 3000 });
```

```typescript
// client
import { SDK } from "./api/client";
const sdk = new SDK({ baseUrl: "http://localhost:3000" });
```

See the [quick start](https://docs.postgresdk.com/getting-started/quick-start/) for the full walkthrough.

## Requirements

- Node.js 18.17+ (or Bun)
- PostgreSQL 12+
- A TypeScript project to consume the generated code

## Supported frameworks

Currently postgresdk only generates server code for **Hono**. The config accepts
`serverFramework: "hono" | "express" | "fastify"`, but only Hono is implemented; `express`/`fastify`
are reserved and will error. See the docs for the rationale and roadmap.

## Contributing to the docs

Docs live in [`docs/`](./docs) (Astro Starlight). Reference pages are **generated from this
package's own source**, so they can't drift.

Not sure which task you need? Run `task start` for an interactive menu. Otherwise:

```bash
task docs:gen           # regenerate CLI, config, and operator references
task docs:gen:contract  # regenerate the "generated API example" (needs Docker)
task docs:dev           # run the docs site locally
task docs:build         # build the static site (emits llms.txt)
```

## License

MIT
