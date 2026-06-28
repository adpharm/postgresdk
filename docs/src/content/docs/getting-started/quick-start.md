---
title: Quick start
description: Install postgresdk, generate an API + SDK from your schema, and wire up a server and client.
sidebar:
  order: 1
---

This walks through generating a typed API server and client SDK from an existing Postgres
database. For every option, see the [Configuration reference](/reference/configuration/); for
every command, see the [CLI reference](/reference/cli/).

## 1. Initialize

```bash
bunx postgresdk@latest init
```

This writes a `postgresdk.config.ts` with all options documented.

## 2. Configure your connection

The only required field is `connectionString`:

```ts
import type { Config } from "postgresdk";

export default {
  connectionString: process.env.DATABASE_URL!,
  // outDir defaults to { client: "./api/client", server: "./api/server" }
} satisfies Config;
```

## 3. Generate

```bash
bunx postgresdk@latest generate   # alias: gen
```

postgresdk introspects the schema and writes the server + client code (and a `CONTRACT.md`
describing everything it emitted — see a [real example](/reference/generated-api-example/)).

## 4. Set up the server

```ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { createRouter } from "./api/server/router"; // path depends on your outDir

const app = new Hono();

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

app.route("/", createRouter({ pg }));

serve({ fetch: app.fetch, port: 3000 });
```

See [Server setup](/guides/server-setup/) for database drivers, the `onRequest` hook, and auth.

## 5. Use the client SDK

```ts
import { SDK } from "./api/client"; // path depends on your outDir

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

const user = await sdk.users.create({ name: "Alice", email: "alice@example.com" });
const { data } = await sdk.users.list({ where: { status: "active" }, include: { posts: true } });
await sdk.users.update(user.id, { name: "Alice Smith" });
```

See [Client SDK usage](/guides/client-usage/) for CRUD, includes, transactions, and
[Filtering & WHERE operators](/reference/filtering-operators/) for queries.

## Requirements

- Node.js ≥ 18.17 (or Bun)
- A reachable PostgreSQL database for introspection
- Currently generates **Hono** server code (see [`serverFramework`](/reference/configuration/#config))
