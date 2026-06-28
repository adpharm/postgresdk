---
title: Deployment
description: Connection-pool sizing for serverless vs. traditional servers.
sidebar:
  order: 5
---

The generated server is a standard Hono app — deploy it anywhere Hono runs. The main thing to get
right is **connection-pool sizing**.

## Serverless (Vercel, Netlify, Cloudflare Workers)

Each instance is ephemeral and handles one request at a time, so use `max: 1` — pooling provides
no benefit and wastes database connections.

```ts
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
const router = createRouter({ pg: pool });
```

For edge runtimes, set [`useJsExtensions`](/reference/configuration/#config) so generated imports
include `.js` extensions.

## Traditional servers (Railway, Render, VPS)

Long-running servers handle many concurrent requests; pool to reuse connections.

```ts
import { Pool } from "@neondatabase/serverless"; // or "pg"

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const router = createRouter({ pg: pool });
```
