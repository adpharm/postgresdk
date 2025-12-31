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
- 🔐 **Built-in Auth** - API key and JWT authentication
- 🎯 **Zero Config** - Works out of the box with sensible defaults
- 📦 **Lightweight** - Minimal dependencies, optimized bundle size

---

## Getting Started

### Installation

```bash
npm install -g postgresdk
# or
npx postgresdk generate

# With Bun
bun install -g postgresdk
# or
bunx postgresdk generate
```

> **Note:** Currently only generates **Hono** server code. See [Supported Frameworks](#supported-frameworks) for details.

### Quick Start

1. Initialize your project:

```bash
npx postgresdk init
# or with Bun
bunx postgresdk init
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
postgresdk generate
# or with Bun
bunx postgresdk generate
```

4. Set up your server:

```typescript
import { Hono } from "hono";
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const app = new Hono();
const pg = new Client({ connectionString: "..." });
await pg.connect();

const api = createRouter({ pg });
app.route("/", api);
```

5. Use the client SDK:

```typescript
import { SDK } from "./api/client";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// Full CRUD operations with TypeScript types
const user = await sdk.users.create({ name: "Alice", email: "alice@example.com" });
const users = await sdk.users.list({ include: { posts: true } });
await sdk.users.update(user.id, { name: "Alice Smith" });
await sdk.users.delete(user.id);
```

---

## API Server Setup

### Configuration

Create a `postgresdk.config.ts` file in your project root:

```typescript
export default {
  // Required
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/dbname",

  // Optional (with defaults)
  schema: "public",                    // Database schema to introspect
  outDir: "./api",                     // Output directory (or { client: "./sdk", server: "./api" })
  softDeleteColumn: null,              // Column name for soft deletes (e.g., "deleted_at")
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
        { issuer: "my-app", secret: process.env.JWT_SECRET }
      ]
    }
  },

  // Test generation (optional)
  tests: {
    generate: true,                      // Generate test files
    output: "./api/tests",               // Test output directory
    framework: "vitest"                  // vitest, jest, or bun
  }
};
```

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
    strategy: "jwt-hs256",
    jwt: {
      services: [
        { issuer: "my-app", secret: process.env.JWT_SECRET }
      ],
      audience: "my-api"  // Optional
    }
  }
};

// Multi-service example (each service has its own secret)
export default {
  connectionString: "...",
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      services: [
        { issuer: "web-app", secret: process.env.WEB_APP_SECRET },
        { issuer: "mobile-app", secret: process.env.MOBILE_SECRET },
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
    strategy: "jwt-hs256",
    jwt: {
      services: [
        { issuer: "web-app", secret: process.env.WEB_SECRET },
        { issuer: "analytics-service", secret: process.env.ANALYTICS_SECRET }
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
- SDK files are bundled into `api/server/sdk-bundle.ts` as embedded strings
- Auto-generated endpoints serve the SDK:
  - `GET /_psdk/sdk/manifest` - Lists available files and metadata
  - `GET /_psdk/sdk/download` - Returns complete SDK bundle
  - `GET /_psdk/sdk/files/:path` - Individual file access

**On client applications:**

1. Install postgresdk in your client project:

```bash
npm install -D postgresdk
# or
bun install -D postgresdk
```

2. Pull the SDK from your API:

```bash
npx postgresdk pull --from=https://api.myapp.com --output=./src/sdk
# or with Bun
bunx postgresdk pull --from=https://api.myapp.com --output=./src/sdk
```

3. Use the generated SDK with full TypeScript types:

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
    token: process.env.API_TOKEN  // Optional auth for protected APIs
  }
};
```

Then run:
```bash
npx postgresdk pull
# or
bunx postgresdk pull
```

The SDK files are written directly to your client project, giving you full TypeScript autocomplete and type safety.

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

// Delete
const deleted = await sdk.users.delete(123);
```

#### Relationships & Eager Loading

Automatically handles relationships with the `include` parameter:

```typescript
// 1:N relationship - Get authors with their books
const authorsResult = await sdk.authors.list({
  include: { books: true }
});
const authors = authorsResult.data;

// M:N relationship - Get books with their tags
const booksResult = await sdk.books.list({
  include: { tags: true }
});
const books = booksResult.data;

// Nested includes - Get authors with books and their tags
const nestedResult = await sdk.authors.list({
  include: {
    books: {
      include: {
        tags: true
      }
    }
  }
});
const authorsWithBooksAndTags = nestedResult.data;
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
result.limit;      // number - page size used
result.offset;     // number - offset used
result.hasMore;    // boolean - more pages available

// Calculate pagination info
const totalPages = Math.ceil(result.total / result.limit);
const currentPage = Math.floor(result.offset / result.limit) + 1;

// Multi-column sorting
const sorted = await sdk.users.list({
  orderBy: ["status", "created_at"],
  order: ["asc", "desc"]  // or use single direction: order: "asc"
});

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
```

See the generated SDK documentation for all available operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$like`, `$ilike`, `$is`, `$isNot`, `$or`, `$and`.

---

## Reference

### CLI Commands

```bash
postgresdk <command> [options]

Commands:
  init                 Create a postgresdk.config.ts file
  generate             Generate SDK from database
  pull                 Pull SDK from API endpoint
  version              Show version
  help                 Show help

Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)

Init flags:
  --api                Generate API-side config (for database introspection)
  --sdk                Generate SDK-side config (for consuming remote SDK)

Examples:
  postgresdk init                              # Interactive prompt
  postgresdk init --api                        # API-side config
  postgresdk init --sdk                        # SDK-side config
  postgresdk generate
  postgresdk generate -c custom.config.ts
  postgresdk pull --from=https://api.com --output=./src/sdk
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
