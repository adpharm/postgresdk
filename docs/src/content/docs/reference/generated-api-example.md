---
title: "Generated API example (CONTRACT.md)"
description: "A real CONTRACT.md produced by running postgresdk against the fixture schema."
---

:::caution[Generated file — do not edit by hand]
This page is generated from `test/schema.sql → postgresdk gen → CONTRACT.md` by `task docs:gen`.
Edit the source and regenerate; manual changes are overwritten.
:::


This page is a **real, unedited `CONTRACT.md`** produced by running postgresdk against the
project's fixture schema ([`test/schema.sql`](https://github.com/adpharm/postgresdk/blob/main/test/schema.sql))
— a small library domain (`authors` → `books`, `books` ↔ `tags`, plus `users`/`products` with
`pgvector` and `pg_trgm`). Use it to see exactly what tables, types, methods, and endpoints
postgresdk emits for your own schema.

:::note[Reading the examples below]
- **Import paths are relative to the generated *client* directory** (e.g. `./client`). In the guides
  we use the default `outDir` of `{ client: "./api/client", server: "./api/server" }`, so your
  imports there would start `./api/client`. Adjust to wherever your `outDir` points.
- Some feature snippets (e.g. vector search) use **placeholder table names** to illustrate the
  shape of a call — match them to the real tables in *your* schema.
:::

---

## API & SDK Contract

Unified API and SDK contract - your one-stop reference for all operations

**Version:** 2.0.0

### SDK Setup

#### Installation

```bash
# The SDK is generated in the client/ directory
# Import it directly from your generated code
```

#### Initialization

**Basic initialization:**

```typescript
import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});
```

**With authentication:**

```typescript
import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    apiKey: process.env.API_KEY
  }
});
```

**With custom fetch (for Node.js < 18):**

```typescript
import { SDK } from './client';
import fetch from 'node-fetch';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  fetch: fetch as any
});
```

#### Authentication

**No authentication required:**

```typescript
const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});
```

**Custom headers provider:**

```typescript
const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: async () => ({
    'Authorization': 'Bearer ' + await getToken(),
    'X-Request-ID': generateRequestId()
  })
});
```

### Filtering

Type-safe WHERE clauses. Root-level keys are AND'd; use `$or`/`$and` for logic (2 levels max).

```typescript
await sdk.users.list({
  where: {
    status:     { $in: ['active', 'pending'] },
    age:        { $gte: 18, $lt: 65 },
    email:      { $ilike: '%@company.com' },
    deleted_at: { $is: null },
    meta:       { $jsonbContains: { tag: 'vip' } },
    $or: [{ role: 'admin' }, { role: 'mod' }]
  }
});
```

| Operator | SQL | Types |
|----------|-----|-------|
| `$eq` `$ne` | = ≠ | All |
| `$gt` `$gte` `$lt` `$lte` | > ≥ < ≤ | Number, Date |
| `$in` `$nin` | IN / NOT IN | All |
| `$like` `$ilike` | LIKE / ILIKE | String |
| `$is` `$isNot` | IS NULL / IS NOT NULL | Nullable |
| `$jsonbContains` `$jsonbContainedBy` `$jsonbHasKey` `$jsonbHasAnyKeys` `$jsonbHasAllKeys` `$jsonbPath` | JSONB ops | JSONB |
| `$or` `$and` | OR / AND (2 levels) | — |

### Sorting

`orderBy` accepts a column name or array; `order` accepts `'asc'`/`'desc'` or a per-column array.

```typescript
await sdk.users.list({ orderBy: ['status', 'created_at'], order: ['asc', 'desc'] });
```

### Vector Search

For tables with `vector` columns (requires pgvector). Results include a `_distance` field.

```typescript
const results = await sdk.embeddings.list({
  vector: { field: 'embedding', query: [0.1, 0.2, 0.3, /* ... */], metric: 'cosine', maxDistance: 0.5 },
  where: { status: 'published' },
  limit: 10
}); // results.data[0]._distance
```

### Resources

#### Authors

Resource for authors operations

##### SDK Methods

Access via: `sdk.authors`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Authors>>`
- List authors with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/authors`

```typescript
const result = await sdk.authors.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Authors | null>`
- Get a single authors by primary key
- API: `GET /v1/authors/:id`

```typescript
const item = await sdk.authors.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertAuthors): Promise<Authors>`
- Create a new authors
- API: `POST /v1/authors`

```typescript
const created = await sdk.authors.create({
    name: 'John Doe'
});
```

**update**
- Signature: `update(id: string, data: UpdateAuthors): Promise<Authors>`
- Update an existing authors
- API: `PATCH /v1/authors/:id`

```typescript
const updated = await sdk.authors.update('id', {
    name: 'John Doe'
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateAuthors; create: InsertAuthors; update: UpdateAuthors }): Promise<Authors>`
- Insert or update a authors based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/authors/upsert`

```typescript
const result = await sdk.authors.upsert({
  where: { id: 'some-id' },
  create: {   name: 'John Doe' },
  update: {   name: 'John Doe' },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Authors>`
- Permanently delete a authors
- API: `DELETE /v1/authors/:id`

```typescript
const deleted = await sdk.authors.hardDelete('id');
```

**listWithBooks**
- Signature: `listWithBooks(params?: ListParams): PaginatedResponse<SelectAuthors & { books: SelectBooks[] }>`
- Get authors with included books data
- API: `POST /v1/authors/list`

**getByPkWithBooks**
- Signature: `getByPkWithBooks(id: string): SelectAuthors & { books: SelectBooks[] } | null`
- Get authors with included books data
- API: `POST /v1/authors/list`

**listWithBooksAndTags**
- Signature: `listWithBooksAndTags(params?: ListParams): PaginatedResponse<SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] }>`
- Get authors with included books, tags data
- API: `POST /v1/authors/list`

**getByPkWithBooksAndTags**
- Signature: `getByPkWithBooksAndTags(id: string): SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] } | null`
- Get authors with included books, tags data
- API: `POST /v1/authors/list`

##### API Endpoints

- `GET /v1/authors`
  - List all authors records with pagination metadata
  - Response: `PaginatedResponse<Authors>`
- `GET /v1/authors/:id`
  - Get authors by ID
  - Response: `Authors`
- `POST /v1/authors`
  - Create new authors
  - Request: `InsertAuthors`
  - Response: `Authors`
- `PATCH /v1/authors/:id`
  - Update authors
  - Request: `UpdateAuthors`
  - Response: `Authors`
- `POST /v1/authors/upsert`
  - Upsert authors — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateAuthors; create: InsertAuthors; update: UpdateAuthors }`
  - Response: `Authors`
- `DELETE /v1/authors/:id`
  - Delete authors
  - Response: `Authors`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |

#### BookTags

Resource for book_tags operations

##### SDK Methods

Access via: `sdk.book_tags`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<BookTags>>`
- List book_tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/book_tags`

```typescript
const result = await sdk.book_tags.list({
  where: { book_id: { $ilike: '%value%' } },
  orderBy: 'book_id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**create**
- Signature: `create(data: InsertBookTags): Promise<BookTags>`
- Create a new book_tags
- API: `POST /v1/book_tags`

```typescript
const created = await sdk.book_tags.create({
    book_id: 'related-id-123',
  tag_id: 'related-id-123'
});
```

##### API Endpoints

- `GET /v1/book_tags`
  - List all book_tags records with pagination metadata
  - Response: `PaginatedResponse<BookTags>`
- `POST /v1/book_tags`
  - Create new book_tags
  - Request: `InsertBookTags`
  - Response: `BookTags`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| book_id | uuid | `string` | ✓ | Foreign key to book → books |
| tag_id | uuid | `string` | ✓ | Foreign key to tag → tags |

#### Books

Resource for books operations

##### SDK Methods

Access via: `sdk.books`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Books>>`
- List books with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/books`

```typescript
const result = await sdk.books.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Books | null>`
- Get a single books by primary key
- API: `GET /v1/books/:id`

```typescript
const item = await sdk.books.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertBooks): Promise<Books>`
- Create a new books
- API: `POST /v1/books`

```typescript
const created = await sdk.books.create({
    author_id: 'related-id-123',
  title: 'Example Title'
});
```

**update**
- Signature: `update(id: string, data: UpdateBooks): Promise<Books>`
- Update an existing books
- API: `PATCH /v1/books/:id`

```typescript
const updated = await sdk.books.update('id', {
    author_id: 'related-id-123',
  title: 'Example Title'
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateBooks; create: InsertBooks; update: UpdateBooks }): Promise<Books>`
- Insert or update a books based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/books/upsert`

```typescript
const result = await sdk.books.upsert({
  where: { id: 'some-id' },
  create: {   author_id: 'related-id-123',
  title: 'Example Title' },
  update: {   author_id: 'related-id-123',
  title: 'Example Title' },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Books>`
- Permanently delete a books
- API: `DELETE /v1/books/:id`

```typescript
const deleted = await sdk.books.hardDelete('id');
```

**listWithAuthor**
- Signature: `listWithAuthor(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors | null }>`
- Get books with included author data
- API: `POST /v1/books/list`

**getByPkWithAuthor**
- Signature: `getByPkWithAuthor(id: string): SelectBooks & { author: SelectAuthors | null } | null`
- Get books with included author data
- API: `POST /v1/books/list`

**listWithTags**
- Signature: `listWithTags(params?: ListParams): PaginatedResponse<SelectBooks & { tags: SelectTags[] }>`
- Get books with included tags data
- API: `POST /v1/books/list`

**getByPkWithTags**
- Signature: `getByPkWithTags(id: string): SelectBooks & { tags: SelectTags[] } | null`
- Get books with included tags data
- API: `POST /v1/books/list`

**listWithAuthorAndTags**
- Signature: `listWithAuthorAndTags(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors | null; tags: SelectTags[] }>`
- Get books with included author, tags data
- API: `POST /v1/books/list`

**getByPkWithAuthorAndTags**
- Signature: `getByPkWithAuthorAndTags(id: string): SelectBooks & { author: SelectAuthors | null; tags: SelectTags[] } | null`
- Get books with included author, tags data
- API: `POST /v1/books/list`

##### API Endpoints

- `GET /v1/books`
  - List all books records with pagination metadata
  - Response: `PaginatedResponse<Books>`
- `GET /v1/books/:id`
  - Get books by ID
  - Response: `Books`
- `POST /v1/books`
  - Create new books
  - Request: `InsertBooks`
  - Response: `Books`
- `PATCH /v1/books/:id`
  - Update books
  - Request: `UpdateBooks`
  - Response: `Books`
- `POST /v1/books/upsert`
  - Upsert books — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateBooks; create: InsertBooks; update: UpdateBooks }`
  - Response: `Books`
- `DELETE /v1/books/:id`
  - Delete books
  - Response: `Books`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| author_id | uuid | `string | null` |  | Foreign key to author → authors |
| title | string | `string` | ✓ | title |

#### Products

Resource for products operations

##### SDK Methods

Access via: `sdk.products`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Products>>`
- List products with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/products`

```typescript
const result = await sdk.products.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Products | null>`
- Get a single products by primary key
- API: `GET /v1/products/:id`

```typescript
const item = await sdk.products.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertProducts): Promise<Products>`
- Create a new products
- API: `POST /v1/products`

```typescript
const created = await sdk.products.create({
    name: 'John Doe',
  metadata: { key: 'value' },
  tags: { key: 'value' }
});
```

**update**
- Signature: `update(id: string, data: UpdateProducts): Promise<Products>`
- Update an existing products
- API: `PATCH /v1/products/:id`

```typescript
const updated = await sdk.products.update('id', {
    name: 'John Doe',
  metadata: { key: 'value' }
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateProducts; create: InsertProducts; update: UpdateProducts }): Promise<Products>`
- Insert or update a products based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/products/upsert`

```typescript
const result = await sdk.products.upsert({
  where: { id: 'some-id' },
  create: {   name: 'John Doe',
  metadata: { key: 'value' },
  tags: { key: 'value' } },
  update: {   name: 'John Doe',
  metadata: { key: 'value' } },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Products>`
- Permanently delete a products
- API: `DELETE /v1/products/:id`

```typescript
const deleted = await sdk.products.hardDelete('id');
```

##### API Endpoints

- `GET /v1/products`
  - List all products records with pagination metadata
  - Response: `PaginatedResponse<Products>`
- `GET /v1/products/:id`
  - Get products by ID
  - Response: `Products`
- `POST /v1/products`
  - Create new products
  - Request: `InsertProducts`
  - Response: `Products`
- `PATCH /v1/products/:id`
  - Update products
  - Request: `UpdateProducts`
  - Response: `Products`
- `POST /v1/products/upsert`
  - Upsert products — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateProducts; create: InsertProducts; update: UpdateProducts }`
  - Response: `Products`
- `DELETE /v1/products/:id`
  - Delete products
  - Response: `Products`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |
| metadata | object | `JsonValue | null` |  | metadata |
| tags | object | `JsonValue | null` |  | tags |
| settings | object | `JsonValue | null` |  | settings |

#### Tags

Resource for tags operations

##### SDK Methods

Access via: `sdk.tags`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Tags>>`
- List tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/tags`

```typescript
const result = await sdk.tags.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Tags | null>`
- Get a single tags by primary key
- API: `GET /v1/tags/:id`

```typescript
const item = await sdk.tags.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertTags): Promise<Tags>`
- Create a new tags
- API: `POST /v1/tags`

```typescript
const created = await sdk.tags.create({
    name: 'John Doe'
});
```

**update**
- Signature: `update(id: string, data: UpdateTags): Promise<Tags>`
- Update an existing tags
- API: `PATCH /v1/tags/:id`

```typescript
const updated = await sdk.tags.update('id', {
    name: 'John Doe'
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateTags; create: InsertTags; update: UpdateTags }): Promise<Tags>`
- Insert or update a tags based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/tags/upsert`

```typescript
const result = await sdk.tags.upsert({
  where: { id: 'some-id' },
  create: {   name: 'John Doe' },
  update: {   name: 'John Doe' },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Tags>`
- Permanently delete a tags
- API: `DELETE /v1/tags/:id`

```typescript
const deleted = await sdk.tags.hardDelete('id');
```

**listWithBooks**
- Signature: `listWithBooks(params?: ListParams): PaginatedResponse<SelectTags & { books: SelectBooks[] }>`
- Get tags with included books data
- API: `POST /v1/tags/list`

**getByPkWithBooks**
- Signature: `getByPkWithBooks(id: string): SelectTags & { books: SelectBooks[] } | null`
- Get tags with included books data
- API: `POST /v1/tags/list`

**listWithBooksAndAuthor**
- Signature: `listWithBooksAndAuthor(params?: ListParams): PaginatedResponse<SelectTags & { books: (SelectBooks & { author: SelectAuthors | null })[] }>`
- Get tags with included books, author data
- API: `POST /v1/tags/list`

**getByPkWithBooksAndAuthor**
- Signature: `getByPkWithBooksAndAuthor(id: string): SelectTags & { books: (SelectBooks & { author: SelectAuthors | null })[] } | null`
- Get tags with included books, author data
- API: `POST /v1/tags/list`

##### API Endpoints

- `GET /v1/tags`
  - List all tags records with pagination metadata
  - Response: `PaginatedResponse<Tags>`
- `GET /v1/tags/:id`
  - Get tags by ID
  - Response: `Tags`
- `POST /v1/tags`
  - Create new tags
  - Request: `InsertTags`
  - Response: `Tags`
- `PATCH /v1/tags/:id`
  - Update tags
  - Request: `UpdateTags`
  - Response: `Tags`
- `POST /v1/tags/upsert`
  - Upsert tags — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateTags; create: InsertTags; update: UpdateTags }`
  - Response: `Tags`
- `DELETE /v1/tags/:id`
  - Delete tags
  - Response: `Tags`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |

#### Users

Resource for users operations

##### SDK Methods

Access via: `sdk.users`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Users>>`
- List users with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/users`

```typescript
const result = await sdk.users.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Users | null>`
- Get a single users by primary key
- API: `GET /v1/users/:id`

```typescript
const item = await sdk.users.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertUsers): Promise<Users>`
- Create a new users
- API: `POST /v1/users`

```typescript
const created = await sdk.users.create({
    email: 'user@example.com',
  profile: { key: 'value' },
  preferences: { key: 'value' }
});
```

**update**
- Signature: `update(id: string, data: UpdateUsers): Promise<Users>`
- Update an existing users
- API: `PATCH /v1/users/:id`

```typescript
const updated = await sdk.users.update('id', {
    email: 'user@example.com',
  profile: { key: 'value' }
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateUsers; create: InsertUsers; update: UpdateUsers }): Promise<Users>`
- Insert or update a users based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/users/upsert`

```typescript
const result = await sdk.users.upsert({
  where: { id: 'some-id' },
  create: {   email: 'user@example.com',
  profile: { key: 'value' },
  preferences: { key: 'value' } },
  update: {   email: 'user@example.com',
  profile: { key: 'value' } },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Users>`
- Permanently delete a users
- API: `DELETE /v1/users/:id`

```typescript
const deleted = await sdk.users.hardDelete('id');
```

##### API Endpoints

- `GET /v1/users`
  - List all users records with pagination metadata
  - Response: `PaginatedResponse<Users>`
- `GET /v1/users/:id`
  - Get users by ID
  - Response: `Users`
- `POST /v1/users`
  - Create new users
  - Request: `InsertUsers`
  - Response: `Users`
- `PATCH /v1/users/:id`
  - Update users
  - Request: `UpdateUsers`
  - Response: `Users`
- `POST /v1/users/upsert`
  - Upsert users — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateUsers; create: InsertUsers; update: UpdateUsers }`
  - Response: `Users`
- `DELETE /v1/users/:id`
  - Delete users
  - Response: `Users`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| email | string | `string` | ✓ | email |
| profile | object | `JsonValue | null` |  | profile |
| preferences | object | `JsonValue | null` |  | preferences |

#### VideoSections

Resource for video_sections operations

##### SDK Methods

Access via: `sdk.video_sections`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<VideoSections>>`
- List video_sections with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/video_sections`

```typescript
const result = await sdk.video_sections.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<VideoSections | null>`
- Get a single video_sections by primary key
- API: `GET /v1/video_sections/:id`

```typescript
const item = await sdk.video_sections.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertVideoSections): Promise<VideoSections>`
- Create a new video_sections
- API: `POST /v1/video_sections`

```typescript
const created = await sdk.video_sections.create({
    title: 'Example Title',
  status: 'active',
  vision_embedding: 'example value'
});
```

**update**
- Signature: `update(id: string, data: UpdateVideoSections): Promise<VideoSections>`
- Update an existing video_sections
- API: `PATCH /v1/video_sections/:id`

```typescript
const updated = await sdk.video_sections.update('id', {
    title: 'Example Title',
  status: 'active'
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateVideoSections; create: InsertVideoSections; update: UpdateVideoSections }): Promise<VideoSections>`
- Insert or update a video_sections based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/video_sections/upsert`

```typescript
const result = await sdk.video_sections.upsert({
  where: { id: 'some-id' },
  create: {   title: 'Example Title',
  status: 'active',
  vision_embedding: 'example value' },
  update: {   title: 'Example Title',
  status: 'active' },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<VideoSections>`
- Permanently delete a video_sections
- API: `DELETE /v1/video_sections/:id`

```typescript
const deleted = await sdk.video_sections.hardDelete('id');
```

##### API Endpoints

- `GET /v1/video_sections`
  - List all video_sections records with pagination metadata
  - Response: `PaginatedResponse<VideoSections>`
- `GET /v1/video_sections/:id`
  - Get video_sections by ID
  - Response: `VideoSections`
- `POST /v1/video_sections`
  - Create new video_sections
  - Request: `InsertVideoSections`
  - Response: `VideoSections`
- `PATCH /v1/video_sections/:id`
  - Update video_sections
  - Request: `UpdateVideoSections`
  - Response: `VideoSections`
- `POST /v1/video_sections/upsert`
  - Upsert video_sections — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateVideoSections; create: InsertVideoSections; update: UpdateVideoSections }`
  - Response: `VideoSections`
- `DELETE /v1/video_sections/:id`
  - Delete video_sections
  - Response: `VideoSections`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| title | string | `string` | ✓ | title |
| status | string | `string | null` |  | status |
| vision_embedding | number[] | `number[] | null` |  | vision embedding |
| text_embedding | number[] | `number[] | null` |  | text embedding |
| created_at | date/datetime | `string | null` |  | Creation timestamp |

#### Websites

Resource for websites operations

##### SDK Methods

Access via: `sdk.websites`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Websites>>`
- List websites with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/websites`

```typescript
const result = await sdk.websites.list({
  where: { id: { $ilike: '%value%' } },
  orderBy: 'id',
  order: 'desc',
  limit: 20,
  offset: 0
}); // result.data, result.total, result.hasMore
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Websites | null>`
- Get a single websites by primary key
- API: `GET /v1/websites/:id`

```typescript
const item = await sdk.websites.getByPk('id'); // null if not found
```

**create**
- Signature: `create(data: InsertWebsites): Promise<Websites>`
- Create a new websites
- API: `POST /v1/websites`

```typescript
const created = await sdk.websites.create({
    name: 'John Doe',
  url: 'https://example.com'
});
```

**update**
- Signature: `update(id: string, data: UpdateWebsites): Promise<Websites>`
- Update an existing websites
- API: `PATCH /v1/websites/:id`

```typescript
const updated = await sdk.websites.update('id', {
    name: 'John Doe',
  url: 'https://example.com'
});
```

**upsert**
- Signature: `upsert(args: { where: UpdateWebsites; create: InsertWebsites; update: UpdateWebsites }): Promise<Websites>`
- Insert or update a websites based on a conflict target. The 'where' keys define the unique conflict columns (must be a unique constraint). 'create' is used if no conflict; 'update' is applied if a conflict occurs.
- API: `POST /v1/websites/upsert`

```typescript
const result = await sdk.websites.upsert({
  where: { id: 'some-id' },
  create: {   name: 'John Doe',
  url: 'https://example.com' },
  update: {   name: 'John Doe',
  url: 'https://example.com' },
});
```

**hardDelete**
- Signature: `hardDelete(id: string): Promise<Websites>`
- Permanently delete a websites
- API: `DELETE /v1/websites/:id`

```typescript
const deleted = await sdk.websites.hardDelete('id');
```

##### API Endpoints

- `GET /v1/websites`
  - List all websites records with pagination metadata
  - Response: `PaginatedResponse<Websites>`
- `GET /v1/websites/:id`
  - Get websites by ID
  - Response: `Websites`
- `POST /v1/websites`
  - Create new websites
  - Request: `InsertWebsites`
  - Response: `Websites`
- `PATCH /v1/websites/:id`
  - Update websites
  - Request: `UpdateWebsites`
  - Response: `Websites`
- `POST /v1/websites/upsert`
  - Upsert websites — insert if no conflict on 'where' columns, update otherwise
  - Request: `{ where: UpdateWebsites; create: InsertWebsites; update: UpdateWebsites }`
  - Response: `Websites`
- `DELETE /v1/websites/:id`
  - Delete websites
  - Response: `Websites`

##### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |
| url | string | `string` | ✓ | url |

### Relationships

- **book_tags** → **books** (many-to-one): Each book_tags belongs to one books
- **book_tags** → **tags** (many-to-one): Each book_tags belongs to one tags
- **books** → **authors** (many-to-one): Each books belongs to one authors

### Type Imports

```typescript
import { SDK } from './client';
import type { SelectTableName, InsertTableName, UpdateTableName } from './client/types/table_name';
import type * as Types from './client/types';
```
