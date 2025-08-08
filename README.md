# postgresdk

Generate a fully-typed, production-ready SDK from your PostgreSQL database schema. Automatically creates both server-side REST API routes and client-side SDK with TypeScript types, Zod validation, and support for complex relationships.

## Features

- 🚀 **Instant SDK Generation** - Point at your PostgreSQL database and get a complete SDK
- 🔒 **Type Safety** - Full TypeScript types derived from your database schema  
- ✅ **Runtime Validation** - Zod schemas for request/response validation
- 🔗 **Smart Relationships** - Automatic handling of 1:N and M:N relationships with eager loading
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
  connectionString: "postgres://user:pass@localhost:5432/dbname",
  
  // Optional (with defaults)
  schema: "public",                    // Database schema to introspect
  outServer: "./generated/server",     // Server code output directory  
  outClient: "./generated/client",     // Client SDK output directory
  softDeleteColumn: null,              // Column name for soft deletes (e.g., "deleted_at")
  includeDepthLimit: 3,                 // Max depth for nested includes
  dateType: "date",                    // "date" | "string" - How to handle timestamps
};
```

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

## Server Integration

The generated server code is designed for [Hono](https://hono.dev/) but can be adapted to other frameworks:

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { Client } from "pg";

// Import generated route registrations
import { registerUsersRoutes } from "./generated/server/routes/users";
import { registerPostsRoutes } from "./generated/server/routes/posts";

const app = new Hono();
const pg = new Client({ connectionString: process.env.DATABASE_URL });
await pg.connect();

// Register routes
registerUsersRoutes(app, { pg });
registerPostsRoutes(app, { pg });

// Start server
serve({ fetch: app.fetch, port: 3000 });
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