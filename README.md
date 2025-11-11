# postgresdk

> ⚠️ **Active Development**: This project is under active development and is not yet stable for production use. APIs and features may change without notice.

Generate a typed server/client SDK from your PostgreSQL database schema.

## Features

- 🚀 **Instant SDK Generation** - Point at your PostgreSQL database and get a complete SDK
- 🔒 **Type Safety** - Full TypeScript types derived from your database schema  
- ✅ **Runtime Validation** - Zod schemas for request/response validation
- 🔗 **Smart Relationships** - Automatic handling of 1:N and M:N relationships with eager loading
- 🔐 **Built-in Auth** - API key and JWT authentication
- 🎯 **Zero Config** - Works out of the box with sensible defaults
- 📦 **Lightweight** - Minimal dependencies, optimized bundle size

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
import { createRouter } from "./api/server/router";

const app = new Hono();
const pg = new Client({ connectionString: "..." });
await pg.connect();

const api = createRouter({ pg });
app.route("/", api);

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
  includeMethodsDepth: 2,               // Max depth for nested includes
  dateType: "date",                    // "date" | "string" - How to handle timestamps
  serverFramework: "hono",             // Currently only hono is supported
  useJsExtensions: false,              // Add .js to imports (for Vercel Edge, Deno)
  
  // Authentication (optional)
  auth: {
    apiKey: process.env.API_KEY,        // Simple API key auth
    // OR
    jwt: process.env.JWT_SECRET,        // Simple JWT auth
  },
  
  // Test generation (optional)
  tests: {
    generate: true,                      // Generate test files
    output: "./api/tests",               // Test output directory
    framework: "vitest"                  // vitest, jest, or bun
  }
};
```

## Generated SDK Usage

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
// Simple equality filtering
const users = await sdk.users.list({
  where: { status: "active" },
  orderBy: "created_at",
  order: "desc",
  limit: 20,
  offset: 40
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
```

See the generated SDK documentation for all available operators: `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$like`, `$ilike`, `$is`, `$isNot`.

## Authentication

postgresdk supports API key and JWT authentication:

### API Key Authentication

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

### JWT Authentication (HS256)

```typescript
// postgresdk.config.ts
export default {
  connectionString: "...",
  auth: {
    jwt: process.env.JWT_SECRET
  }
};

// Client SDK usage
const sdk = new SDK({
  baseUrl: "http://localhost:3000",
  auth: { jwt: "eyJhbGciOiJIUzI1NiIs..." }
});
```

## Database Drivers

The generated code works with any PostgreSQL client that implements a simple `query` interface:

### Node.js `pg` Driver

```typescript
import { Client } from "pg";
import { createRouter } from "./api/server/router";

const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

const apiRouter = createRouter({ pg });
```

### Neon Serverless Driver (Edge-Compatible)

```typescript
import { Pool } from "@neondatabase/serverless";
import { createRouter } from "./api/server/router";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const apiRouter = createRouter({ pg: pool });
```

## Server Integration

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

## SDK Distribution

Your generated SDK can be pulled by client applications:

```bash
# In your client app
postgresdk pull --from=https://api.myapp.com --output=./src/sdk
```

Or with configuration:

```typescript
// postgresdk.config.ts in client app
export default {
  pull: {
    from: "https://api.myapp.com",
    output: "./src/sdk",
    token: process.env.API_TOKEN  // Optional auth
  }
};
```

## Generated Tests

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
```

## CLI Commands

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

Examples:
  postgresdk init
  postgresdk generate
  postgresdk generate -c custom.config.ts
  postgresdk pull --from=https://api.com --output=./src/sdk
```

## Requirements

- Node.js 18+ 
- PostgreSQL 12+
- TypeScript project (for using generated code)

## License

MIT