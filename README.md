# postgresdk

> ⚠️ **Active Development**: This project is under active development and is not yet stable for production use. APIs and features may change without notice.

Generate a typed server/client SDK from your PostgreSQL database schema.

## What It Does

**Your database:**
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL
);

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  title TEXT NOT NULL,
  published_at TIMESTAMPTZ
);
```

**What you get:**
```typescript
// ✨ Fully typed client with autocomplete
const user = await sdk.users.create({
  name: "Alice",
  email: "alice@example.com"
});
// ^ TypeScript knows: user.id is number, user.name is string

// 🔗 Automatic relationship loading
const users = await sdk.users.list({
  include: { posts: true }
});
// ^ users[0].posts is fully typed Post[]

// 🎯 Advanced filtering with type safety
const filtered = await sdk.users.list({
  where: {
    email: { $ilike: '%@company.com' },
    posts: { published_at: { $isNot: null } }
  }
});
```

**All generated automatically. Zero boilerplate.**

## Features

- 🚀 **Instant SDK Generation** - Point at your PostgreSQL database and get a complete SDK
- 🔒 **Type Safety** - Full TypeScript types derived from your database schema (including enum types)
- ✅ **Runtime Validation** - Zod schemas for request/response validation
- 🔗 **Smart Relationships** - Automatic handling of 1:N and M:N relationships with eager loading
- 🔍 **Vector Search** - Built-in pgvector support for similarity search with multiple distance metrics
- ⚡ **Atomic Transactions** - Execute multiple operations atomically via `sdk.$transaction([...])`
- 🔐 **Built-in Auth** - API key and JWT authentication
- 🎯 **Zero Config** - Works out of the box with sensible defaults
- 📦 **Lightweight** - Minimal dependencies, optimized bundle size

---

## Getting Started

> **Note:** Currently only generates **Hono** server code. See [Supported Frameworks](#supported-frameworks) for details.

### Quick Start

1. Initialize your project:

```bash
npx postgresdk@latest init
# or
bunx postgresdk@latest init
# or
pnpm dlx postgresdk@latest init
```

This creates a `postgresdk.config.ts` file with all available options documented.

2. Edit the configuration file with your database connection:

```typescript
export default {
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/mydb",
  // Uncomment and customize other options as needed
};
```

3. Run the generator:

```bash
npx postgresdk@latest generate
# or
bunx postgresdk@latest generate
# or
pnpm dlx postgresdk@latest generate
```

4. Set up your server:

```typescript
import { Hono } from "hono";
import { Client } from "pg";
import { createRouter } from "./api/server/router"; // Path depends on your outDir config

const app = new Hono();
const pg = new Client({ connectionString: "..." });
await pg.connect();

const api = createRouter({ pg });
app.route("/", api);
```

5. Use the client SDK:

```typescript
import { SDK } from "./api/client"; // Path depends on your outDir config

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// Full CRUD operations with TypeScript types
const user = await sdk.users.create({ name: "Alice", email: "alice@example.com" });
const users = await sdk.users.list({ include: { posts: true } });
await sdk.users.update(user.id, { name: "Alice Smith" });
await sdk.users.hardDelete(user.id);
```

---

## API Server Setup

> **Note:** Code examples in this section use default output paths (`./api/server/`, `./api/client/`). If you configure a custom `outDir`, adjust import paths accordingly.

### Configuration

Create a `postgresdk.config.ts` file in your project root:

```typescript
export default {
  // Required
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/dbname",

  // Optional (with defaults)
  schema: "public",                    // Database schema to introspect
  outDir: "./api",                     // Output directory (or { client: "./sdk", server: "./api" })
  delete: {                            // Soft/hard delete configuration (optional)
    softDeleteColumn: "deleted_at",    //   Column name for soft deletes (omit = hard deletes only)
    exposeHardDelete: true,            //   Also expose hardDelete() — set false to disable (default: true)
    softDeleteColumnOverrides: {       //   Per-table overrides
      // audit_logs: null,             //     hard deletes only for this table
    },
  },
  numericMode: "auto",                 // "auto" | "number" | "string" - How to type numeric columns
  maxLimit: 1000,                      // Max allowed `limit` value (0 = no cap)
  includeMethodsDepth: 2,              // Max depth for nested includes
  dateType: "date",                    // "date" | "string" - How to handle timestamps
  serverFramework: "hono",             // Currently only hono is supported
  useJsExtensions: false,              // Add .js to imports (for Vercel Edge, Deno)

  // Authentication (optional)
  auth: {
    apiKey: process.env.API_KEY,        // Simple API key auth
    // OR
    jwt: {                              // JWT with multi-service support
      services: [
        { issuer: "my-app", secret: "env:JWT_SECRET" }  // Use "env:" prefix!
      ],
      audience: "my-api"                // Optional: validate aud claim
    }
  },

  // SDK endpoint protection (optional)
  pullToken: "env:POSTGRESDK_PULL_TOKEN",  // Protect /_psdk/* endpoints (if not set, public)

  // Test generation (optional)
  tests: {
    generate: true,                      // Generate test files
    output: "./api/tests",               // Test output directory
    framework: "vitest"                  // vitest, jest, or bun
  }
};
```

#### Type Mapping (numericMode)

Controls how PostgreSQL numeric types map to TypeScript:

- **`"auto"` (default)**: `int2`/`int4`/floats → `number`, `int8`/`numeric` → `string`
- **`"number"`**: All numeric → `number` (⚠️ unsafe for bigint - JS can't handle values > 2^53)
- **`"string"`**: All numeric → `string` (safe but requires parsing)

### Database Drivers

The generated code works with any PostgreSQL client that implements a simple `query` interface:

#### Node.js `pg` Driver

```typescript
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const apiRouter = createRouter({ pg });
```

#### Neon Serverless Driver (Edge-Compatible)

```typescript
import { Pool } from "@neondatabase/serverless";
import { createRouter } from "./api/server/router";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const apiRouter = createRouter({ pg: pool });
```

### Server Integration

postgresdk generates Hono-compatible routes:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const app = new Hono();

// Database connection
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Mount all generated routes
const apiRouter = createRouter({ pg });
app.route("/", apiRouter);

// Start server
serve({ fetch: app.fetch, port: 3000 });
```

#### Request-Level Middleware (onRequest Hook)

The `onRequest` hook executes before every endpoint operation, enabling:
- Setting PostgreSQL session variables for audit logging
- Configuring Row-Level Security (RLS) based on authenticated user
- Request-level logging or monitoring

```typescript
import { createRouter } from "./api/server/router";

const apiRouter = createRouter({
  pg,
  onRequest: async (c, pg) => {
    // Access Hono context - fully type-safe
    const auth = c.get('auth');

    // Set PostgreSQL session variable for audit triggers
    if (auth?.kind === 'jwt' && auth.claims?.sub) {
      await pg.query(`SET LOCAL app.user_id = '${auth.claims.sub}'`);
    }

    // Or configure RLS policies
    if (auth?.tenant_id) {
      await pg.query(`SET LOCAL app.tenant_id = '${auth.tenant_id}'`);
    }
  }
});
```

The hook receives:
- `c` - Hono Context object with full type safety and IDE autocomplete
- `pg` - PostgreSQL client for setting session variables

**Note:** The router works with or without the `onRequest` hook - fully backward compatible.

### Authentication

postgresdk supports API key and JWT authentication:

#### API Key Authentication

```typescript
// postgresdk.config.ts
export default {
  connectionString: "...",
  auth: {
    apiKey: process.env.API_KEY
  }
};

// Client SDK usage
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { apiKey: process.env.API_KEY }
});
```

#### JWT Authentication (HS256)

```typescript
// postgresdk.config.ts
export default {
  connectionString: "...",
  auth: {
    jwt: {
      services: [
        { issuer: "my-app", secret: "env:JWT_SECRET" }  // Use "env:" prefix!
      ],
      audience: "my-api"  // Optional
    }
  }
};

// Multi-service example (each service has its own secret)
export default {
  connectionString: "...",
  auth: {
    jwt: {
      services: [
        { issuer: "web-app", secret: "env:WEB_APP_SECRET" },
        { issuer: "mobile-app", secret: "env:MOBILE_SECRET" },
      ],
      audience: "my-api"
    }
  }
};

// Client SDK usage
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { jwt: "eyJhbGciOiJIUzI1NiIs..." }  // JWT must include 'iss' claim
});
```

#### Service-to-Service Authorization

For service-to-service authorization (controlling which services can access which tables/actions), use JWT claims with the `onRequest` hook instead of built-in config scopes:

**Why this approach?**
- **Standard**: Follows OAuth2/OIDC conventions (authorization in token claims, not API config)
- **Dynamic**: Different tokens can have different permissions (service accounts vs user sessions)
- **Flexible**: Supports table-level, row-level, and field-level authorization in one place

```typescript
// 1. Your auth service issues JWTs with scopes in claims
import { sign } from "jsonwebtoken";

const token = sign({
  iss: "analytics-service",
  sub: "service-123",
  aud: "my-api",
  scopes: ["users:read", "posts:read", "analytics:*"]  // ← Authorization here
}, process.env.ANALYTICS_SECRET);

// 2. API config remains simple (authentication only)
export default {
  connectionString: process.env.DATABASE_URL,
  auth: {
    jwt: {
      services: [
        { issuer: "web-app", secret: "env:WEB_SECRET" },
        { issuer: "analytics-service", secret: "env:ANALYTICS_SECRET" }
      ],
      audience: "my-api"
    }
  }
};

// 3. Enforce scopes in onRequest hook
import { createRouter } from "./api/server/router";

function hasPermission(scopes: string[], table: string, method: string): boolean {
  const action = { POST: "create", GET: "read", PUT: "update", DELETE: "delete" }[method];

  return scopes.some(scope => {
    const [scopeTable, scopeAction] = scope.split(":");
    return (scopeTable === "*" || scopeTable === table) &&
           (scopeAction === "*" || scopeAction === action);
  });
}

function getTableFromPath(path: string): string {
  // Extract table from path like "/v1/users" or "/v1/posts/123"
  return path.split("/")[2];
}

const apiRouter = createRouter({
  pg,
  onRequest: async (c, pg) => {
    const auth = c.get("auth");

    // Extract scopes from JWT claims
    const scopes = auth?.claims?.scopes || [];
    const table = getTableFromPath(c.req.path);
    const method = c.req.method;

    // Enforce permission
    if (!hasPermission(scopes, table, method)) {
      throw new Error(`Forbidden: ${auth?.claims?.iss} lacks ${table}:${method}`);
    }

    // Optional: Set session variables for audit logging
    if (auth?.claims?.sub) {
      await pg.query(`SET LOCAL app.service_id = $1`, [auth.claims.sub]);
    }
  }
});
```

**Advanced patterns:**

```typescript
// Row-level security (RLS)
onRequest: async (c, pg) => {
  const auth = c.get("auth");
  const userId = auth?.claims?.sub;

  // Enable RLS for this session
  await pg.query(`SET LOCAL app.user_id = $1`, [userId]);
  // Now your RLS policies automatically filter rows
}

// Field-level restrictions
onRequest: async (c, pg) => {
  const auth = c.get("auth");
  const scopes = auth?.claims?.scopes || [];

  // Store scopes in session for use in SELECT queries
  await pg.query(`SET LOCAL app.scopes = $1`, [JSON.stringify(scopes)]);

  // Your stored procedures/views can read app.scopes to hide sensitive fields
}

// Complex business logic
onRequest: async (c, pg) => {
  const auth = c.get("auth");
  const table = getTableFromPath(c.req.path);

  // Custom rules per service
  if (auth?.claims?.iss === "analytics-service" && c.req.method !== "GET") {
    throw new Error("Analytics service is read-only");
  }

  // Time-based restrictions
  const hour = new Date().getHours();
  if (auth?.claims?.iss === "batch-processor" && hour >= 8 && hour <= 17) {
    throw new Error("Batch jobs only run outside business hours");
  }
}
```

### Deployment

#### Serverless (Vercel, Netlify, Cloudflare Workers)

Use `max: 1` - each serverless instance should hold one connection:

```typescript
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1  // One connection per serverless instance
});

const apiRouter = createRouter({ pg: pool });
```

**Why `max: 1`?** Serverless functions are ephemeral and isolated. Each instance handles one request at a time, so connection pooling provides no benefit and wastes database connections.

#### Traditional Servers (Railway, Render, VPS)

Use connection pooling to reuse connections across requests:

```typescript
import { Pool } from "@neondatabase/serverless";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10  // Reuse connections across requests
});

const apiRouter = createRouter({ pg: pool });
```

**Why `max: 10`?** Long-running servers handle many concurrent requests. Pooling prevents opening/closing connections for every request, significantly improving performance.

---

## Client SDK

### SDK Distribution

When you run `postgresdk generate`, the client SDK is automatically bundled into your server code and exposed via HTTP endpoints. This allows client applications to pull the SDK directly from your running API.

#### How It Works

**On the API server:**
- SDK files are bundled into your server output directory as `sdk-bundle.ts` (embedded as strings)
- Auto-generated endpoints serve the SDK:
  - `GET /_psdk/sdk/manifest` - Lists available files and metadata
  - `GET /_psdk/sdk/download` - Returns complete SDK bundle
  - `GET /_psdk/sdk/files/:path` - Individual file access

**On client applications:**

1. Pull the SDK from your API:

```bash
npx postgresdk@latest pull --from=https://api.myapp.com --output=./src/sdk
# or
bunx postgresdk@latest pull --from=https://api.myapp.com --output=./src/sdk
# or
pnpm dlx postgresdk@latest pull --from=https://api.myapp.com --output=./src/sdk
```

2. Use the generated SDK with full TypeScript types:

```typescript
import { SDK } from "./src/sdk";

const sdk = new SDK({ baseUrl: "https://api.myapp.com" });
const users = await sdk.users.list();
```

**Using a config file (recommended):**

```typescript
// postgresdk.config.ts in client app
export default {
  pull: {
    from: "https://api.myapp.com",
    output: "./src/sdk",
    pullToken: "env:POSTGRESDK_PULL_TOKEN"  // Optional: if server has pullToken set
  }
};
```

Then run:
```bash
npx postgresdk@latest pull
# or
bunx postgresdk@latest pull
# or
pnpm dlx postgresdk@latest pull
```

The SDK files are written directly to your client project, giving you full TypeScript autocomplete and type safety.

**Stale file cleanup:** Both `generate` and `pull` automatically remove files that are no longer part of the SDK. In an interactive terminal you'll be prompted to confirm each deletion; use `--force` (or `-y`) to skip prompts. In non-interactive environments (CI), stale files are skipped with a warning unless `--force` is passed.

### Using the SDK

#### CRUD Operations

Every table gets a complete set of CRUD operations:

```typescript
// Create
const user = await sdk.users.create({ name: "Bob", email: "bob@example.com" });

// Read
const user = await sdk.users.getByPk(123);
const result = await sdk.users.list();
const users = result.data;  // Array of users

// Update
const updated = await sdk.users.update(123, { name: "Robert" });

// Upsert — insert if no conflict, update otherwise (Prisma-style)
const upserted = await sdk.users.upsert({
  where:  { email: "alice@example.com" },       // conflict target (must be a unique constraint)
  create: { email: "alice@example.com", name: "Alice" },
  update: { name: "Alice Updated" },
});

// Delete
const deleted = await sdk.users.hardDelete(123);     // permanent deletion
// await sdk.users.softDelete(123);                  // soft-delete (when softDeleteColumn is configured)
```

#### Atomic Transactions

Execute multiple operations in a single PostgreSQL transaction — all succeed or all roll back:

```typescript
const [order, updatedUser] = await sdk.$transaction([
  sdk.orders.$create({ user_id: user.id, total: 99 }),
  sdk.users.$update(user.id, { last_order_at: new Date().toISOString() }),
]);
// TypeScript infers: [SelectOrders, SelectUsers | null]
```

- `$create`, `$update`, `$softDelete`, `$hardDelete`, `$upsert` are **lazy builders** — nothing executes until `$transaction` is called
- All ops are Zod-validated **before** `BEGIN` is issued (fail-fast, no partial state)
- On any failure the transaction rolls back; an error is thrown with a `.failedAt` index

```typescript
try {
  const results = await sdk.$transaction([
    sdk.inventory.$update(itemId, { stock: newStock }),
    sdk.orders.$create({ item_id: itemId, qty: 1 }),
    sdk.audit_log.$create({ action: "purchase", item_id: itemId }),
    // $upsert also works inside transactions:
    sdk.users.$upsert({
      where:  { email: "alice@example.com" },
      create: { email: "alice@example.com", name: "Alice" },
      update: { name: "Alice Updated" },
    }),
  ]);
} catch (err: any) {
  console.error(`Failed at op ${err.failedAt}:`, err.message);
}
```

#### Relationships & Eager Loading

Automatically handles relationships with the `include` parameter. **Type inference works automatically** - no manual casts needed:

```typescript
// 1:N relationship - Get authors with their books
const authorsResult = await sdk.authors.list({
  include: { books: true }
});
const authors = authorsResult.data;
// ✅ authors[0].books is automatically typed as SelectBooks[]

// M:N relationship - Get books with their tags
const booksResult = await sdk.books.list({
  include: { tags: true }
});
const books = booksResult.data;
// ✅ books[0].tags is automatically typed as SelectTags[]

// Nested includes - Get authors with books and their tags
const nestedResult = await sdk.authors.list({
  include: {
    books: {
      tags: true
    }
  }
});
const authorsWithBooksAndTags = nestedResult.data;
// ✅ TypeScript knows: data[0].books[0].tags exists and is SelectTags[]
```

**Typed Include Methods:**

For convenience and better type safety, the SDK generates `listWith*` and `getByPkWith*` methods for common include patterns:

```typescript
// Typed methods provide full autocomplete and type safety
const result = await sdk.authors.listWithBooks();
// result.data[0].books is typed as SelectBooks[]

// Control included relations with options
const topAuthors = await sdk.authors.listWithBooks({
  limit: 10,
  booksInclude: {
    orderBy: 'published_at',
    order: 'desc',
    limit: 5  // Only get top 5 books per author
  }
});

// Parallel includes (multiple relations at once)
const result2 = await sdk.books.listWithAuthorAndTags({
  tagsInclude: {
    orderBy: 'name',
    limit: 3
  }
  // author is included automatically (one-to-one)
});

// Nested includes with control at each level
const result3 = await sdk.authors.listWithBooksAndTags({
  booksInclude: {
    orderBy: 'title',
    limit: 10,
    include: {
      tags: {
        orderBy: 'name',
        order: 'asc',
        limit: 5
      }
    }
  }
});

// Works with getByPk too
const author = await sdk.authors.getByPkWithBooks('author-id', {
  booksInclude: {
    orderBy: 'published_at',
    limit: 3
  }
});
```

#### Filtering & Pagination

All `list()` methods return pagination metadata:

```typescript
const result = await sdk.users.list({
  where: { status: "active" },
  orderBy: "created_at",
  order: "desc",
  limit: 20,
  offset: 40
});

// Access results
result.data;       // User[] - array of records
result.total;      // number - total matching records
result.limit;      // number | undefined - page size used (absent when no limit specified)
result.offset;     // number - offset used
result.hasMore;    // boolean - more pages available (false when no limit)

// Note: Omitting `limit` returns all matching records. Max limit is controlled by `maxLimit` config (default: 1000).

// Calculate pagination info (when using explicit limit)
const totalPages = result.limit ? Math.ceil(result.total / result.limit) : 1;
const currentPage = result.limit ? Math.floor(result.offset / result.limit) + 1 : 1;

// Multi-column sorting
const sorted = await sdk.users.list({
  orderBy: ["status", "created_at"],
  order: ["asc", "desc"]  // or use single direction: order: "asc"
});

// DISTINCT ON - one row per unique value (PostgreSQL)
const latestPerUser = await sdk.events.list({
  distinctOn: "user_id",             // or array: ["user_id", "type"]
  orderBy: "created_at",
  order: "desc"
});
// Returns one event per user_id, ordered by created_at DESC.
// When orderBy contains columns outside of distinctOn, a subquery is used
// automatically so the outer ordering is always respected.

// Advanced WHERE operators
const filtered = await sdk.users.list({
  where: {
    age: { $gte: 18, $lt: 65 },           // Range queries
    email: { $ilike: '%@company.com' },   // Pattern matching
    status: { $in: ['active', 'pending'] }, // Array matching
    deleted_at: { $is: null }              // NULL checks
  }
});
// filtered.total respects WHERE clause for accurate counts

// OR logic - match any condition
const results = await sdk.users.list({
  where: {
    $or: [
      { email: { $ilike: '%@gmail.com' } },
      { email: { $ilike: '%@yahoo.com' } },
      { status: 'premium' }
    ]
  }
});

// Complex queries with AND/OR
const complex = await sdk.users.list({
  where: {
    status: 'active',  // Implicit AND at root level
    $or: [
      { age: { $lt: 18 } },
      { age: { $gt: 65 } }
    ]
  }
});

// Nested logic (2 levels)
const nested = await sdk.users.list({
  where: {
    $and: [
      {
        $or: [
          { firstName: { $ilike: '%john%' } },
          { lastName: { $ilike: '%john%' } }
        ]
      },
      { status: 'active' }
    ]
  }
});

// Soft deletes — when `delete.softDeleteColumn` is configured in postgresdk.config.ts,
// the SDK exposes softDelete() and hardDelete() instead of a single delete():
//
//   softDelete(id)   → sets the soft-delete column (e.g. deleted_at = NOW())
//   hardDelete(id)   → permanent DELETE (available unless exposeHardDelete: false)
//
// Soft-deleted rows are hidden from list/getByPk by default.
// Pass includeSoftDeleted: true to opt into seeing them (e.g., for admin/recovery UIs).
const allUsers = await sdk.users.list({ includeSoftDeleted: true });
const deletedUser = await sdk.users.getByPk("123", { includeSoftDeleted: true });

// Pagination with filtered results
let allResults = [];
let offset = 0;
const limit = 50;
do {
  const page = await sdk.users.list({ where: { status: 'active' }, limit, offset });
  allResults = allResults.concat(page.data);
  offset += limit;
  if (!page.hasMore) break;
} while (true);

// Field filtering with select/exclude
const withSelect = await sdk.users.list({
  select: ['id', 'email', 'name'],  // Only return these fields
  limit: 10
});
// Result: { data: [{ id, email, name }], total, ... }

const withExclude = await sdk.users.list({
  exclude: ['password_hash', 'secret_token'],  // Return all fields except these
  where: { status: 'active' }
});
// Result: All fields except password_hash and secret_token

// Select/exclude on single record operations
const created = await sdk.users.create(
  { email: 'user@example.com', name: 'Alice' },
  { select: ['id', 'email'] }  // Only return id and email
);

const updated = await sdk.users.update(
  userId,
  { name: 'Bob' },
  { exclude: ['created_at', 'updated_at'] }
);

const fetched = await sdk.users.getByPk(userId, { select: ['id', 'name'] });
const deleted = await sdk.users.hardDelete(userId, { select: ['id', 'email'] });

// Nested select/exclude in includes
const withNestedSelect = await sdk.authors.list({
  select: ['id', 'name'],
  include: {
    books: {
      select: ['id', 'title'],  // Filter included books too
      orderBy: 'published_at',
      order: 'desc',
      limit: 5
    }
  }
});
// Result: authors with only id/name, books with only id/title

// JSONB queries
const products = await sdk.products.list({
  where: {
    metadata: { $jsonbContains: { tags: ["premium"] } },  // Contains check
    settings: { $jsonbHasKey: "theme" },                  // Key exists
    $and: [
      { config: { $jsonbPath: { path: ["price"], operator: "$gte", value: 100 } } },  // Nested value
      { config: { $jsonbPath: { path: ["category"], value: "electronics" } } }
    ]
  }
});

// Type-safe JSONB with generics
type Metadata = { tags: string[]; stats: { views: number } };
const users = await sdk.users.list<{ metadata: Metadata }>({
  where: {
    metadata: { $jsonbContains: { tags: ["vip"] } }  // Fully typed!
  }
});
users.data[0].metadata.stats.views;  // TypeScript knows this is a number
```

#### Vector Search (pgvector)

PostgreSDK automatically detects `vector` columns and enables similarity search using [pgvector](https://github.com/pgvector/pgvector). Requires pgvector extension installed.

```sql
-- Example schema with vector columns
CREATE EXTENSION vector;

CREATE TABLE video_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  vision_embedding vector(1536),  -- Image/video embeddings
  text_embedding vector(1536),     -- Text embeddings
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```typescript
// Basic vector similarity search
const results = await sdk.video_sections.list({
  vector: {
    field: "vision_embedding",
    query: visionEmbeddingArray,  // number[] - your embedding vector
    metric: "cosine"  // "cosine" (default), "l2", or "inner"
  },
  limit: 10
});

// Returns records ordered by similarity, with distance included
results.data.forEach(section => {
  console.log(section.title, section._distance);  // _distance auto-included
});

// Distance threshold filtering
const closeMatches = await sdk.video_sections.list({
  vector: {
    field: "vision_embedding",
    query: embedding,
    metric: "cosine",
    maxDistance: 0.5  // Only return results within this distance
  },
  limit: 50
});

// Hybrid search: combine vector similarity with traditional filters
const results = await sdk.video_sections.list({
  vector: {
    field: "vision_embedding",
    query: embedding,
    maxDistance: 0.6
  },
  where: {
    status: "published",
    vision_embedding: { $isNot: null }  // Ensure embedding exists
  },
  limit: 20
});

// Parallel multi-modal search (vision + text)
const [visionResults, textResults] = await Promise.all([
  sdk.video_sections.list({
    vector: {
      field: "vision_embedding",
      query: visionQueryEmbedding,
      metric: "cosine",
      maxDistance: 0.6
    },
    where: { vision_embedding: { $isNot: null } },
    limit: 50
  }),

  sdk.video_sections.list({
    vector: {
      field: "text_embedding",
      query: textQueryEmbedding,
      metric: "cosine",
      maxDistance: 0.5
    },
    where: { text_embedding: { $isNot: null } },
    limit: 50
  })
]);

// Merge and deduplicate results
const allResults = [...visionResults.data, ...textResults.data];
const uniqueResults = Array.from(
  new Map(allResults.map(r => [r.id, r])).values()
);
```

**Distance Metrics:**
- `cosine`: Cosine distance (best for normalized embeddings, range 0-2)
- `l2`: Euclidean distance (L2 norm)
- `inner`: Inner product (negative for similarity)

**Note:** Vector columns are auto-detected during introspection. Rows with `NULL` embeddings are excluded from vector search results.

#### Trigram Search (pg_trgm)

PostgreSDK supports full-text fuzzy search via [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html). Requires the `pg_trgm` extension installed.

```sql
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
```

```typescript
// Basic trigram similarity search on a text field
const results = await sdk.books.list({
  trigram: {
    field: "title",
    query: "postgrs",          // typo-tolerant fuzzy match
    metric: "similarity",      // "similarity" (default), "wordSimilarity", "strictWordSimilarity"
    threshold: 0.3             // optional: exclude rows below this score (0–1)
  },
  limit: 10
});

// _similarity score is automatically included in each result
results.data.forEach(book => {
  console.log(book.title, book._similarity);
});

// Combine with WHERE filters
const filtered = await sdk.books.list({
  trigram: { field: "title", query: "postgrs", threshold: 0.2 },
  where: { published: true },
  limit: 20
});
```

**Similarity Metrics:**
- `similarity` (default): Standard trigram similarity — `"col" % value`. Fraction of matching trigrams.
- `wordSimilarity`: Highest similarity between the query and any word in the column — `value <% "col"`.
- `strictWordSimilarity`: Strict word similarity — `value <<% "col"`. Requires the query to match an entire word.

**Inline `where` operators (without a top-level `trigram` param):**
```typescript
// Filter by trigram similarity inside a where clause
const results = await sdk.books.list({
  where: {
    title: { $similarity: "postgrs" }          // % operator
    // title: { $wordSimilarity: "postgrs" }   // <% operator
    // title: { $strictWordSimilarity: "postgrs" } // <<% operator
  }
});
```

**Multi-field trigram search:**
```typescript
// Greatest strategy (default): score = GREATEST(sim(name), sim(url))
const results = await sdk.websites.list({
  trigram: { fields: ["name", "url"], query: "google", strategy: "greatest" }
});

// Concat strategy: concatenate fields before scoring ("name url")
const results = await sdk.websites.list({
  trigram: { fields: ["name", "url"], query: "google", strategy: "concat" }
});

// Weighted strategy: weighted average of per-field scores
const results = await sdk.websites.list({
  trigram: {
    fields: [{ field: "name", weight: 2 }, { field: "url", weight: 1 }],
    query: "google"
  }
});
```

**Note:** `trigram` and `vector` are mutually exclusive on a single `list()` call.

See the generated SDK documentation for all available operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$like`, `$ilike`, `$similarity`, `$wordSimilarity`, `$strictWordSimilarity`, `$is`, `$isNot`, `$or`, `$and`, `$jsonbContains`, `$jsonbContainedBy`, `$jsonbHasKey`, `$jsonbHasAnyKeys`, `$jsonbHasAllKeys`, `$jsonbPath`.

---

## Reference

### CLI Commands

```bash
npx postgresdk@latest <command> [options]
# or: bunx postgresdk@latest
# or: pnpm dlx postgresdk@latest

Commands:
  init                 Create a postgresdk.config.ts file
  generate             Generate SDK from database
  pull                 Pull SDK from API endpoint
  version              Show version
  help                 Show help

Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)
  --force, -y          Delete stale files without prompting (generate & pull)

Init subcommands/flags:
  init pull            Generate pull-only config (alias for --sdk)
  init --api           Generate API-side config (for database introspection)
  init --sdk           Generate SDK-side config (for consuming remote SDK)

Examples:
  npx postgresdk@latest init                              # Interactive prompt
  npx postgresdk@latest init pull                         # Pull-only config
  npx postgresdk@latest init --api                        # API-side config
  npx postgresdk@latest generate
  npx postgresdk@latest generate -c custom.config.ts
  npx postgresdk@latest generate --force                  # Skip stale file prompts
  npx postgresdk@latest pull --from=https://api.com --output=./src/sdk
  npx postgresdk@latest pull --from=https://api.com --output=./src/sdk --force
```

### Generated Tests

Enable test generation in your config:

```typescript
export default {
  connectionString: process.env.DATABASE_URL,
  tests: {
    generate: true,
    output: "./api/tests",
    framework: "vitest"
  }
};
```

Run tests with the included Docker setup:

```bash
chmod +x api/tests/run-tests.sh
./api/tests/run-tests.sh

# Or with Bun's built-in test runner (if framework: "bun")
bun test
```

### Requirements

- Node.js 18+
- PostgreSQL 12+
- TypeScript project (for using generated code)

### Supported Frameworks

**Currently, postgresdk only generates server code for Hono.**

While the configuration accepts `serverFramework: "hono" | "express" | "fastify"`, only Hono is implemented at this time. Attempting to generate code with `express` or `fastify` will result in an error.

#### Why Hono?

Hono was chosen as the initial framework because:
- **Edge-first design** - Works seamlessly in serverless and edge environments (Cloudflare Workers, Vercel Edge, Deno Deploy)
- **Minimal dependencies** - Lightweight with excellent performance
- **Modern patterns** - Web Standard APIs (Request/Response), TypeScript-first
- **Framework compatibility** - Works across Node.js, Bun, Deno, and edge runtimes

#### Future Framework Support

The codebase architecture is designed to support multiple frameworks. Adding Express or Fastify support would require:
- Implementing framework-specific route emitters (`emit-routes-express.ts`, etc.)
- Implementing framework-specific router creators (`emit-router-express.ts`, etc.)

Contributions to add additional framework support are welcome.

## License

MIT
