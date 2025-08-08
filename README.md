# postgresdk

Turn your PostgreSQL database into a fully-typed, production-ready SDK in seconds.

## What You Get

Start with your existing PostgreSQL database:

```sql
CREATE TABLE authors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bio TEXT
);

CREATE TABLE books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author_id UUID REFERENCES authors(id),
  published_at TIMESTAMPTZ
);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE book_tags (
  book_id UUID REFERENCES books(id),
  tag_id UUID REFERENCES tags(id),
  PRIMARY KEY (book_id, tag_id)
);
```

Run one command:

```bash
npx postgresdk
```

Get a complete, type-safe SDK with:

### 🎯 Client SDK with Full TypeScript Support

```typescript
import { SDK } from "./generated/client";

const sdk = new SDK({ 
  baseUrl: "http://localhost:3000",
  auth: { apiKey: "your-key" }  // Optional auth
});

// ✅ Fully typed - autocomplete everything!
const author = await sdk.authors.create({
  name: "Jane Austen",
  bio: "English novelist known for social commentary"
});

// ✅ Type-safe relationships with eager loading
const booksWithAuthor = await sdk.books.list({
  include: { 
    author: true,      // 1:N relationship
    tags: true         // M:N relationship
  }
});

// ✅ Complex nested queries
const authorsWithEverything = await sdk.authors.list({
  include: {
    books: {
      include: {
        tags: true
      }
    }
  }
});

// ✅ Built-in pagination & filtering
const recentBooks = await sdk.books.list({
  where: { published_at: { gte: "2024-01-01" } },
  orderBy: "published_at",
  order: "desc",
  limit: 10
});
```

### 🚀 Production-Ready REST API

```typescript
import { Hono } from "hono";
import { Client } from "pg";
import { createRouter } from "./generated/server/router";

const app = new Hono();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// That's it! Full REST API with:
// - Input validation (Zod)
// - Error handling
// - Relationship loading
// - Auth middleware (if configured)
// - Type safety throughout

const api = createRouter({ pg });
app.route("/", api);

// GET    /v1/authors
// POST   /v1/authors
// GET    /v1/authors/:id
// PATCH  /v1/authors/:id
// DELETE /v1/authors/:id
// POST   /v1/authors/list  (with filtering & includes)
```

### 🔒 Type Safety Everywhere

```typescript
// TypeScript catches errors at compile time
const book = await sdk.books.create({
  title: "Pride and Prejudice",
  author_id: "not-a-uuid",     // ❌ Type error!
  published_at: "invalid-date"  // ❌ Type error!
});

// Generated Zod schemas for runtime validation
import { InsertBooksSchema } from "./generated/server/zod/books";

const validated = InsertBooksSchema.parse(requestBody);
```

All from your existing database schema. No manual coding required.

## Features

- 🚀 **Instant SDK Generation** - Point at your PostgreSQL database and get a complete SDK
- 🔒 **Type Safety** - Full TypeScript types derived from your database schema  
- ✅ **Runtime Validation** - Zod schemas for request/response validation
- 🔗 **Smart Relationships** - Automatic handling of 1:N and M:N relationships with eager loading
- 🔐 **Built-in Auth** - API key and JWT authentication with zero configuration
- 🎯 **Zero Config** - Works out of the box with sensible defaults
- 🏗️ **Framework Ready** - Server routes built for Hono, client SDK works anywhere
- 📦 **Lightweight** - Minimal dependencies, optimized for production

## Installation

```bash
npm install -g postgresdk
# or
npx postgresdk
```

## Quick Start

1. Create a configuration file `postgresdk.config.ts`:

```typescript
export default {
  connectionString: "postgres://user:pass@localhost:5432/mydb",
  schema: "public",
  outServer: "./generated/server",
  outClient: "./generated/client",
};
```

2. Run the generator:

```bash
postgresdk
```

3. Use the generated SDK:

```typescript
// Server (Hono)
import { Hono } from "hono";
import { Client } from "pg";
import { registerUsersRoutes } from "./generated/server/routes/users";

const app = new Hono();
const pg = new Client({ connectionString: "..." });
await pg.connect();

registerUsersRoutes(app, { pg });

// Client
import { SDK } from "./generated/client";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// Full CRUD operations with TypeScript types
const user = await sdk.users.create({ name: "Alice", email: "alice@example.com" });
const users = await sdk.users.list({ include: { posts: true } });
await sdk.users.update(user.id, { name: "Alice Smith" });
await sdk.users.delete(user.id);
```

## Configuration

Create a `postgresdk.config.ts` file in your project root:

```typescript
export default {
  // Required
  connectionString: process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/dbname",
  
  // Optional (with defaults)
  schema: "public",                    // Database schema to introspect
  outServer: "./generated/server",     // Server code output directory  
  outClient: "./generated/client",     // Client SDK output directory
  softDeleteColumn: null,              // Column name for soft deletes (e.g., "deleted_at")
  includeDepthLimit: 3,                 // Max depth for nested includes
  dateType: "date",                    // "date" | "string" - How to handle timestamps
  
  // Authentication (optional)
  auth: {
    strategy: "none" | "api-key" | "jwt-hs256",  // Default: "none"
    
    // For API key auth
    apiKeyHeader: "x-api-key",         // Header name for API key
    apiKeys: ["key1", "key2"],         // Array of valid keys
    
    // For JWT auth (HS256)
    jwt: {
      sharedSecret: "your-secret",     // Shared secret for HS256
      issuer: "your-app",               // Optional: validate issuer claim
      audience: "your-audience"        // Optional: validate audience claim
    }
  }
};
```

Environment variables work directly in the config file - no function wrapper needed. postgresdk automatically loads `.env` files using dotenv.

### Environment Variables

postgresdk automatically loads environment variables from `.env` files in your project root. You can use them directly in your config:

```bash
# .env
DATABASE_URL=postgres://user:pass@localhost:5432/mydb
JWT_SECRET=my-super-secret-key
API_KEYS=key1,key2,key3
```

```typescript
// postgresdk.config.ts
export default {
  connectionString: process.env.DATABASE_URL,
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: process.env.JWT_SECRET,
    }
  }
};
```

No additional setup required - dotenv is automatically configured before loading your config file.

## Generated SDK Features

### CRUD Operations

Every table gets a complete set of CRUD operations:

```typescript
// Create
const user = await sdk.users.create({ name: "Bob", email: "bob@example.com" });

// Read
const user = await sdk.users.getByPk(123);
const users = await sdk.users.list();

// Update  
const updated = await sdk.users.update(123, { name: "Robert" });

// Delete
const deleted = await sdk.users.delete(123);
```

### Relationships & Eager Loading

Automatically handles relationships with the `include` parameter:

```typescript
// 1:N relationship - Get authors with their books
const authors = await sdk.authors.list({
  include: { books: true }
});

// M:N relationship - Get books with their tags
const books = await sdk.books.list({
  include: { tags: true }
});

// Nested includes - Get authors with books and their tags
const authors = await sdk.authors.list({
  include: {
    books: {
      include: {
        tags: true
      }
    }
  }
});
```

### Filtering & Pagination

```typescript
const users = await sdk.users.list({
  where: { status: "active" },
  orderBy: "created_at",
  order: "desc",
  limit: 20,
  offset: 40
});
```

### Type Safety

All operations are fully typed based on your database schema:

```typescript
// TypeScript will enforce correct types
const user = await sdk.users.create({
  name: "Alice",        // ✅ string required
  email: "alice@...",   // ✅ string required  
  age: "30"            // ❌ Type error: should be number
});
```

## Authentication

postgresdk supports three authentication strategies out of the box:

### No Authentication (Default)

```typescript
// postgresdk.config.ts
export default {
  connectionString: "...",
  // No auth config needed - routes are unprotected
};
```

### API Key Authentication

```typescript
// postgresdk.config.ts - Simplified syntax
export default {
  connectionString: "...",
  auth: {
    apiKey: "your-api-key"  // Single key shorthand
  }
};

// Or multiple keys
export default {
  connectionString: "...",
  auth: {
    apiKeys: ["key1", "key2", "key3"]
  }
};

// Or full syntax with custom header
export default {
  connectionString: "...",
  auth: {
    strategy: "api-key",
    apiKeyHeader: "x-api-key",  // Optional, defaults to "x-api-key"
    apiKeys: [
      "your-api-key-1",
      "your-api-key-2",
      // Can also use environment variables
      "env:API_KEYS"  // Reads comma-separated keys from process.env.API_KEYS
    ]
  }
};

// Client SDK usage
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { apiKey: "your-api-key-1" }
});
```

### JWT Authentication (HS256)

```typescript
// postgresdk.config.ts - Simplified syntax
export default {
  connectionString: "...",
  auth: {
    jwt: "your-secret-key"  // Shared secret shorthand
  }
};

// Or full syntax with issuer/audience validation
export default {
  connectionString: "...",
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: process.env.JWT_SECRET || "your-secret-key",
      issuer: "my-app",        // Optional: validates 'iss' claim
      audience: "my-users"     // Optional: validates 'aud' claim
    }
  }
};

// Client SDK usage with static token
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { jwt: "eyJhbGciOiJIUzI1NiIs..." }
});

// Or with dynamic token provider
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { 
    jwt: async () => {
      // Refresh token if needed
      return await getAccessToken();
    }
  }
});

// Or with custom auth headers
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: async () => ({
    "Authorization": `Bearer ${await getToken()}`,
    "X-Tenant-ID": "tenant-123"
  })
});
```

### Environment Variables in Auth Config

The auth configuration supports environment variables with the `env:` prefix:

```typescript
export default {
  auth: {
    strategy: "api-key",
    apiKeys: ["env:API_KEYS"],  // Reads from process.env.API_KEYS
    
    // Or for JWT
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: "env:JWT_SECRET"  // Reads from process.env.JWT_SECRET
    }
  }
};
```

### How Auth Works

When authentication is configured:

1. **Server Side**: All generated routes are automatically protected with the configured auth middleware
2. **Client Side**: The SDK handles auth headers transparently
3. **Type Safety**: Auth configuration is fully typed
4. **Zero Overhead**: When `strategy: "none"`, no auth code is included

### JWT Token Generation Example

```typescript
// Install jose for JWT generation: npm install jose
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode('your-secret-key');

const token = await new SignJWT({ 
  sub: 'user123',
  email: 'user@example.com',
  roles: ['admin']
})
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuer('my-app')
  .setAudience('my-users')
  .setExpirationTime('2h')
  .sign(secret);

// Use with SDK
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { jwt: token }
});
```

## Server Integration with Hono

The generated code integrates seamlessly with [Hono](https://hono.dev/), a lightweight web framework for the Edge.

### Basic Setup

postgresdk generates a `createRouter` function that returns a Hono router with all your routes:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { createRouter } from "./generated/server/router";

const app = new Hono();

// Database connection
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Mount all generated routes at once
const apiRouter = createRouter({ pg });
app.route("/", apiRouter);

// Start server
serve({ fetch: app.fetch, port: 3000 });
console.log("Server running on http://localhost:3000");
```

### Mounting Routes at Different Paths

The `createRouter` function returns a Hono router that can be mounted anywhere:

```typescript
import { Hono } from "hono";
import { createRouter } from "./generated/server/router";

const app = new Hono();

// Your existing routes
app.get("/", (c) => c.json({ message: "Welcome" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// Mount generated routes under /api
const apiRouter = createRouter({ pg });
app.route("/api", apiRouter);  // Routes will be at /api/v1/users, /api/v1/posts, etc.

// Or mount under different version
app.route("/v2", apiRouter);   // Routes will be at /v2/v1/users, /v2/v1/posts, etc.
```

### Alternative: Register Routes Directly

If you prefer to register routes directly on your app without a sub-router:

```typescript
import { registerAllRoutes } from "./generated/server/router";

const app = new Hono();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Register all routes directly on app
registerAllRoutes(app, { pg });
```

### Selective Route Registration

You can also import and register individual routes:

```typescript
import { registerUsersRoutes, registerPostsRoutes } from "./generated/server/router";

const app = new Hono();

// Only register specific routes
registerUsersRoutes(app, { pg });
registerPostsRoutes(app, { pg });

### Adding to an Existing Hono App

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

// Your existing Hono app
const app = new Hono();

// Your existing middleware
app.use("*", cors());
app.use("*", logger());

// Your existing routes
app.get("/", (c) => c.json({ message: "Hello World" }));
app.get("/health", (c) => c.json({ status: "ok" }));

// Add postgresdk generated routes
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// All generated routes are prefixed with /v1 by default
import { registerUsersRoutes } from "./generated/server/routes/users";
import { registerPostsRoutes } from "./generated/server/routes/posts";

registerUsersRoutes(app, { pg });  // Adds /v1/users/*
registerPostsRoutes(app, { pg });  // Adds /v1/posts/*

// Your routes continue to work alongside generated ones
app.get("/custom", (c) => c.json({ custom: true }));
```

### With Error Handling & Logging

```typescript
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const app = new Hono();

// Global error handling
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error("Unhandled error:", err);
  return c.json({ error: "Internal Server Error" }, 500);
});

// Request logging middleware
app.use("*", async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  console.log(`${c.req.method} ${c.req.path} - ${c.res.status} ${ms}ms`);
});

// Register generated routes with database
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

import { registerUsersRoutes } from "./generated/server/routes/users";
registerUsersRoutes(app, { pg });
```

### With Database Connection Pooling

For production, use connection pooling:

```typescript
import { Pool } from "pg";
import { Hono } from "hono";

// Use a connection pool instead of a single client
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,               // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const app = new Hono();

// The generated routes work with both Client and Pool
import { registerUsersRoutes } from "./generated/server/routes/users";
import { registerPostsRoutes } from "./generated/server/routes/posts";

registerUsersRoutes(app, { pg: pool });
registerPostsRoutes(app, { pg: pool });

// Graceful shutdown
process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});
```

### With Different Deployment Targets

```typescript
// For Node.js
import { serve } from "@hono/node-server";
serve({ fetch: app.fetch, port: 3000 });

// For Cloudflare Workers
export default app;

// For Vercel
import { handle } from "@hono/vercel";
export default handle(app);

// For AWS Lambda
import { handle } from "@hono/aws-lambda";
export const handler = handle(app);

// For Deno
Deno.serve(app.fetch);

// For Bun
export default {
  port: 3000,
  fetch: app.fetch,
};
```

### Complete Production Example

```typescript
import { Hono } from "hono";
import { cors } from "hono/cors";
import { compress } from "hono/compress";
import { secureHeaders } from "hono/secure-headers";
import { serve } from "@hono/node-server";
import { Pool } from "pg";

// Import all generated route registrations
import { registerUsersRoutes } from "./generated/server/routes/users";
import { registerPostsRoutes } from "./generated/server/routes/posts";
import { registerCommentsRoutes } from "./generated/server/routes/comments";

// Create app with type safety
const app = new Hono();

// Production middleware stack
app.use("*", cors({
  origin: process.env.ALLOWED_ORIGINS?.split(",") || "*",
  credentials: true,
}));
app.use("*", compress());
app.use("*", secureHeaders());

// Health check
app.get("/health", (c) => c.json({ 
  status: "ok", 
  timestamp: new Date().toISOString() 
}));

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 20,
});

// Register all generated routes
registerUsersRoutes(app, { pg: pool });
registerPostsRoutes(app, { pg: pool });
registerCommentsRoutes(app, { pg: pool });

// 404 handler
app.notFound((c) => c.json({ error: "Not Found" }, 404));

// Global error handler
app.onError((err, c) => {
  console.error(`Error ${c.req.method} ${c.req.path}:`, err);
  return c.json({ 
    error: process.env.NODE_ENV === "production" 
      ? "Internal Server Error" 
      : err.message 
  }, 500);
});

// Start server
const port = parseInt(process.env.PORT || "3000");
serve({ 
  fetch: app.fetch, 
  port,
  hostname: "0.0.0.0"
});

console.log(`Server running on http://localhost:${port}`);
console.log(`Environment: ${process.env.NODE_ENV || "development"}`);

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing connections...");
  await pool.end();
  process.exit(0);
});
```

## CLI Options

```bash
postgresdk [options]

Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)
  -v, --version        Show version
  -h, --help           Show help
```

## How It Works

1. **Introspection** - Connects to your PostgreSQL database and reads the schema
2. **Relationship Detection** - Analyzes foreign keys to understand table relationships
3. **Code Generation** - Generates TypeScript code for:
   - Type definitions from table schemas
   - Zod validation schemas
   - REST API route handlers
   - Client SDK with full typing
   - Include/eager-loading system
4. **Output** - Writes generated files to specified directories

## Requirements

- Node.js 20+ 
- PostgreSQL 12+
- TypeScript project (for using generated code)
- Optional: `jose` package for JWT authentication (auto-installed when using JWT auth)

## Development

```bash
# Clone the repository
git clone https://github.com/adpharm/postgresdk.git
cd postgresdk

# Install dependencies
bun install

# Run tests (starts PostgreSQL in Docker)
bun test

# Build
bun run build

# Publish new version
./publish.sh
```

## Testing

The test suite automatically manages a PostgreSQL Docker container:

```bash
bun test
```

Tests cover:
- CRUD operations for all entities
- 1:N and M:N relationships  
- Nested includes
- Validation and error handling

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Support

For issues and feature requests, please [create an issue](https://github.com/adpharm/postgresdk/issues).