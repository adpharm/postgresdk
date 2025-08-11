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
npx postgresdk generate
```

Get a complete, type-safe SDK with:

### 🎯 Client SDK with Full TypeScript Support

```typescript
import { SDK } from "./api/client";

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
import { createRouter } from "./api/server/router";

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
import { InsertBooksSchema } from "./api/server/zod/books";

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
- 🏗️ **Framework Ready** - Server routes for Hono (Express & Fastify coming soon), client SDK works anywhere
- 📦 **Lightweight** - Minimal dependencies, optimized bundle size with shared BaseClient
- 🔄 **SDK Distribution** - Built-in SDK bundling and pull mechanism for easy client distribution

## Installation

```bash
npm install -g postgresdk
# or
npx postgresdk generate
```

## Quick Start

1. Initialize your project:

```bash
npx postgresdk init
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
```

4. Use the generated SDK:

```typescript
// Server (Hono)
import { Hono } from "hono";
import { Client } from "pg";
import { registerUsersRoutes } from "./api/server/routes/users";

const app = new Hono();
const pg = new Client({ connectionString: "..." });
await pg.connect();

registerUsersRoutes(app, { pg });

// Client
import { SDK } from "./api/client";

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
  outServer: "./api/server",           // Server code output directory  
  outClient: "./api/client",           // Client SDK output directory
  softDeleteColumn: null,              // Column name for soft deletes (e.g., "deleted_at")
  includeDepthLimit: 3,                 // Max depth for nested includes
  dateType: "date",                    // "date" | "string" - How to handle timestamps
  serverFramework: "hono",             // "hono" | "express" | "fastify" (currently only hono)
  useJsExtensions: false,              // Add .js to imports (for Vercel Edge, Deno)
  
  // Authentication (optional) - simplified syntax
  auth: {
    apiKey: process.env.API_KEY,        // Simple API key auth
    // OR
    jwt: process.env.JWT_SECRET,        // Simple JWT auth
    // OR full syntax for advanced options:
    strategy: "none" | "api-key" | "jwt-hs256",  // Default: "none"
    apiKeyHeader: "x-api-key",          // Custom header name
    apiKeys: ["key1", "key2"],          // Multiple valid keys
    jwt: {
      sharedSecret: "your-secret",      // Shared secret for HS256
      issuer: "your-app",                // Optional: validate issuer claim
      audience: "your-audience"         // Optional: validate audience claim
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
// postgresdk.config.ts - Simple syntax (recommended)
export default {
  connectionString: "...",
  auth: {
    apiKey: process.env.API_KEY  // Single key shorthand
  }
};

// Or multiple keys
export default {
  connectionString: "...",
  auth: {
    apiKeys: [process.env.API_KEY_1, process.env.API_KEY_2]
  }
};

// Full syntax with custom header (optional)
export default {
  connectionString: "...",
  auth: {
    strategy: "api-key",
    apiKeyHeader: "x-custom-key",  // Default: "x-api-key"
    apiKeys: ["key1", "key2"]
  }
};

// Client SDK usage
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { apiKey: process.env.API_KEY }
});
```

### JWT Authentication (HS256)

```typescript
// postgresdk.config.ts - Simple syntax (recommended)
export default {
  connectionString: "...",
  auth: {
    jwt: process.env.JWT_SECRET  // Shared secret shorthand
  }
};

// Full syntax with issuer/audience validation (optional)
export default {
  connectionString: "...",
  auth: {
    strategy: "jwt-hs256",
    jwt: {
      sharedSecret: process.env.JWT_SECRET,
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

## Database Drivers

The generated code works with any PostgreSQL client that implements a simple `query` interface. You can use the standard `pg` driver, Neon's serverless driver, or any other compatible client.

### Node.js `pg` Driver

The standard PostgreSQL driver for Node.js environments. Works everywhere Node.js runs.

Server setup:
```typescript
import { Hono } from "hono";
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const app = new Hono();

// Standard pg client
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Wire up the generated routes
const apiRouter = createRouter({ pg });
app.route("/", apiRouter);
```

### Neon Serverless Driver (Edge-Compatible)

For edge environments like Vercel Edge Functions or Cloudflare Workers. Uses HTTP/WebSocket instead of TCP connections.

Configuration for Vercel Edge:
```typescript
// postgresdk.config.ts
export default {
  connectionString: process.env.DATABASE_URL,
  serverFramework: "hono",     // Hono is edge-compatible
  useJsExtensions: true,        // Required for Vercel Edge
  dateType: "string",           // Better for JSON serialization
  auth: { apiKey: process.env.API_KEY }
};
```

Server setup:
```typescript
import { Hono } from "hono";
import { Pool } from "@neondatabase/serverless";
import { createRouter } from "./api/server/router";

const app = new Hono();

// Neon's Pool is compatible with node-postgres
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });

// Wire up the generated routes (Pool has the same query interface)
const apiRouter = createRouter({ pg: pool });
app.route("/", apiRouter);

// Deploy to Vercel Edge
export const config = { runtime: 'edge' };
export default app;
```

### Which Driver Should I Use?

- **Use `pg` (default) when:**
  - Running on traditional Node.js servers
  - Using Docker, VPS, or dedicated hosting
  - Need connection pooling or advanced PostgreSQL features
  - Running on AWS Lambda, Google Cloud Functions (with Node.js runtime)

- **Use `neon` when:**
  - Deploying to Vercel Edge Functions
  - Deploying to Cloudflare Workers
  - Need globally distributed edge computing
  - Want to avoid TCP connection overhead
  - Using Neon as your PostgreSQL provider

### Connection Pooling with `pg`

For production Node.js deployments, use connection pooling:

```typescript
import { Pool } from "pg";
import { createRouter } from "./api/server/router";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// The generated routes work with both Client and Pool
const apiRouter = createRouter({ pg: pool });
```

### Custom Database Adapters

You can use any database client as long as it matches the expected interface:

```typescript
// Any client that implements this interface works
interface DatabaseAdapter {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}

// Both pg and @neondatabase/serverless Pool/Client implement this interface natively
// For other ORMs, you may need to create an adapter:

// Example with a hypothetical ORM that doesn't match the interface
const customClient = new SomeORM();
const pg = {
  async query(text: string, params?: any[]) {
    const result = await customClient.raw(text, params);
    return { rows: result };
  }
};

const apiRouter = createRouter({ pg });
```

## Server Integration with Hono

The generated code integrates seamlessly with [Hono](https://hono.dev/), a lightweight web framework for the Edge.

### Basic Setup

postgresdk generates a `createRouter` function that returns a Hono router with all your routes:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";
import { createRouter } from "./api/server/router";

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
import { createRouter } from "./api/server/router";

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
import { registerAllRoutes } from "./api/server/router";

const app = new Hono();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Register all routes directly on app
registerAllRoutes(app, { pg });
```

### Selective Route Registration

You can also import and register individual routes:

```typescript
import { registerUsersRoutes, registerPostsRoutes } from "./api/server/router";

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
import { registerUsersRoutes } from "./api/server/routes/users";
import { registerPostsRoutes } from "./api/server/routes/posts";

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

import { registerUsersRoutes } from "./api/server/routes/users";
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
import { registerUsersRoutes } from "./api/server/routes/users";
import { registerPostsRoutes } from "./api/server/routes/posts";

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
import { registerUsersRoutes } from "./api/server/routes/users";
import { registerPostsRoutes } from "./api/server/routes/posts";
import { registerCommentsRoutes } from "./api/server/routes/comments";

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

## SDK Distribution

postgresdk makes it easy to distribute your generated SDK to client applications. When you generate your SDK, it's automatically bundled and served through your API, allowing client apps to pull the latest SDK directly.

### Publishing Your SDK

When you run `postgresdk generate`, the SDK is automatically:
1. Generated as TypeScript files for both server and client
2. Bundled and made available through API endpoints
3. Ready to be pulled by client applications

Your API automatically serves the SDK at these endpoints:
- `GET /sdk/manifest` - SDK metadata and file list
- `GET /sdk/download` - Download all SDK files as JSON
- `GET /sdk/files/:path` - Download individual SDK files

### Pulling the SDK in Client Apps

Client applications can pull your SDK using the `postgresdk pull` command:

```bash
# Install postgresdk in your client app
npm install -D postgresdk

# Pull the SDK from your API
postgresdk pull --from=https://api.myapp.com --output=./src/sdk

# Or with authentication
postgresdk pull --from=https://api.myapp.com --output=./src/sdk --token=your-token
```

### Configuration-based Pull

Create a `postgresdk.config.ts` in your client app:

```typescript
export default {
  pull: {
    from: "https://api.myapp.com",
    output: "./src/sdk",
    token: process.env.API_TOKEN  // Optional auth
  }
};
```

Then simply run:
```bash
postgresdk pull
```

### Automated SDK Updates

You can automate SDK updates in your client app's build process:

```json
// package.json
{
  "scripts": {
    "prebuild": "postgresdk pull",
    "build": "tsc"
  }
}
```

### SDK Versioning

The pulled SDK includes metadata about when it was generated and from where:

```typescript
// .postgresdk.json (auto-generated)
{
  "version": "1.0.0",
  "generated": "2024-01-15T10:30:00Z",
  "pulledFrom": "https://api.myapp.com",
  "pulledAt": "2024-01-15T11:00:00Z"
}
```

## Generated Tests

postgresdk can generate basic SDK tests to help you get started quickly. These tests demonstrate CRUD operations for each table and include Docker setup for easy testing.

### Enabling Test Generation

Add test configuration to your `postgresdk.config.ts`:

```typescript
export default {
  connectionString: process.env.DATABASE_URL,
  
  tests: {
    generate: true,              // Enable test generation
    output: "./api/tests",       // Output directory
    framework: "vitest"          // Test framework (vitest, jest, or bun)
  }
};
```

### What Gets Generated

When tests are enabled, postgresdk generates:

1. **Test files for each table** - Basic CRUD operation tests
2. **setup.ts** - Common test utilities and helpers
3. **docker-compose.yml** - PostgreSQL test database configuration
4. **run-tests.sh** - Script to run tests with Docker

### Running Tests with Docker

The generated Docker setup makes it easy to run tests in isolation:

```bash
# Navigate to test directory
cd api/tests

# Start test database
docker-compose up -d

# Wait for database to be ready
sleep 3

# Set environment variables
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5432/testdb"
export TEST_API_URL="http://localhost:3000"

# Run your migrations on test database
# (your migration command here)

# Start your API server
npm run dev &

# Run tests
npm test

# Stop database when done
docker-compose down

# Or use the generated script
bash run-tests.sh
```

### Customizing Tests

The generated tests are basic and meant as a starting point. Create your own test files for:

- Business logic validation
- Complex query scenarios  
- Edge cases and error handling
- Performance testing
- Integration workflows

Example custom test:

```typescript
// tests/custom/user-workflow.test.ts
import { describe, it, expect } from 'vitest';
import { createTestSDK, randomEmail } from '../api/tests/setup';

describe('User Registration Workflow', () => {
  const sdk = createTestSDK();
  
  it('should handle complete registration flow', async () => {
    // Your custom business logic tests
    const user = await sdk.users.create({
      email: randomEmail(),
      name: 'Test User'
    });
    
    // Verify welcome email was sent
    // Check audit logs
    // Validate permissions
    // etc.
  });
});
```

## CLI Commands

```bash
postgresdk <command> [options]

Commands:
  init                 Create a postgresdk.config.ts file with all options
  generate             Generate SDK from database
  pull                 Pull SDK from API endpoint
  version              Show version
  help                 Show help

Init Options:
  (no options)         Creates postgresdk.config.ts in current directory

Generate Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)

Pull Options:
  --from <url>         API URL to pull SDK from
  --output <path>      Output directory (default: ./src/sdk)
  --token <token>      Authentication token
  -c, --config <path>  Path to config file with pull settings

Examples:
  postgresdk init                        # Create config file
  postgresdk generate                    # Generate using default config
  postgresdk generate -c custom.config.ts
  postgresdk pull --from=https://api.com --output=./src/sdk
  postgresdk pull -c client.config.ts    # Pull using config file
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