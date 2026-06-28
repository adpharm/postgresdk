---
title: Server setup
description: Mount the generated Hono router, choose a database driver, use the onRequest hook, and configure auth.
sidebar:
  order: 1
---

The generator emits a `createRouter` factory. You provide a Postgres client; it returns a Hono
router with every table's routes mounted. Import paths below assume the default `outDir`.

## Mount the router

```ts
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

Routes are prefixed with [`apiPathPrefix`](/reference/configuration/#config) (default `/v1`).

## Database drivers

The generated code works with any client exposing a simple `query` interface.

```ts
// Node.js pg driver
import { Client } from "pg";
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();
const router = createRouter({ pg });
```

```ts
// Neon serverless driver (edge-compatible)
import { Pool } from "@neondatabase/serverless";
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const router = createRouter({ pg: pool });
```

## The `onRequest` hook

`onRequest` runs before every operation — ideal for audit session variables or Row-Level
Security. It receives the Hono `Context` (fully typed) and the `pg` client.

```ts
const router = createRouter({
  pg,
  onRequest: async (c, pg) => {
    const auth = c.get("auth");
    if (auth?.kind === "jwt" && auth.claims?.sub) {
      await pg.query(`SET LOCAL app.user_id = '${auth.claims.sub}'`);
    }
  },
});
```

## Authentication

Auth is configured in `postgresdk.config.ts`. See the full shape in the
[Configuration reference](/reference/configuration/#authconfig).

### API key

```ts
// postgresdk.config.ts
export default {
  connectionString: "...",
  auth: { apiKey: process.env.API_KEY },
};
```

```ts
// client
const sdk = new SDK({ baseUrl, auth: { apiKey: process.env.API_KEY } });
```

### JWT (HS256)

Secrets **must** use the `env:` prefix — the generator rewrites `"env:JWT_SECRET"` to
`process.env.JWT_SECRET` in the generated code. Never inline a literal secret.

```ts
// postgresdk.config.ts
export default {
  connectionString: "...",
  auth: {
    jwt: {
      services: [
        { issuer: "web-app", secret: "env:WEB_APP_SECRET" },
        { issuer: "mobile-app", secret: "env:MOBILE_SECRET" },
      ],
      audience: "my-api", // optional: validates the aud claim
    },
  },
};
```

```ts
// client — the JWT must include an `iss` claim matching a configured service
const sdk = new SDK({ baseUrl, auth: { jwt: "eyJhbGciOiJIUzI1NiIs..." } });
```

For service-to-service authorization, put scopes in JWT claims and enforce them in `onRequest`
rather than in config.
