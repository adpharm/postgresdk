# API & SDK Contract

Unified API and SDK contract - your one-stop reference for all operations

**Version:** 2.0.0
**Generated:** 11/20/2025, 5:28:26 PM

## SDK Setup

### Installation

```bash
# The SDK is generated in the client/ directory
# Import it directly from your generated code
```

### Initialization

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

### Authentication

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

## Filtering with WHERE Clauses

The SDK provides type-safe WHERE clause filtering with support for various operators.

### Basic Filtering

**Direct equality:**

```typescript
// Find users with specific email
const users = await sdk.users.list({
  where: { email: 'user@example.com' }
});

// Multiple conditions (AND)
const activeUsers = await sdk.users.list({
  where: {
    status: 'active',
    role: 'admin'
  }
});
```

### Comparison Operators

Use comparison operators for numeric, date, and other comparable fields:

```typescript
// Greater than / Less than
const adults = await sdk.users.list({
  where: { age: { $gt: 18 } }
});

// Range queries
const workingAge = await sdk.users.list({
  where: {
    age: { $gte: 18, $lte: 65 }
  }
});

// Not equal
const notPending = await sdk.orders.list({
  where: { status: { $ne: 'pending' } }
});
```

### String Operators

Pattern matching for string fields:

```typescript
// Case-sensitive LIKE
const johnsmiths = await sdk.users.list({
  where: { name: { $like: '%Smith%' } }
});

// Case-insensitive ILIKE
const gmailUsers = await sdk.users.list({
  where: { email: { $ilike: '%@gmail.com' } }
});
```

### Array Operators

Filter by multiple possible values:

```typescript
// IN - match any value in array
const specificUsers = await sdk.users.list({
  where: {
    id: { $in: ['id1', 'id2', 'id3'] }
  }
});

// NOT IN - exclude values
const nonSystemUsers = await sdk.users.list({
  where: {
    role: { $nin: ['admin', 'system'] }
  }
});
```

### NULL Checks

Check for null or non-null values:

```typescript
// IS NULL
const activeRecords = await sdk.records.list({
  where: { deleted_at: { $is: null } }
});

// IS NOT NULL
const deletedRecords = await sdk.records.list({
  where: { deleted_at: { $isNot: null } }
});
```

### Combining Operators

Mix multiple operators for complex queries:

```typescript
const filteredUsers = await sdk.users.list({
  where: {
    age: { $gte: 18, $lt: 65 },
    email: { $ilike: '%@company.com' },
    status: { $in: ['active', 'pending'] },
    deleted_at: { $is: null }
  },
  limit: 50,
  offset: 0
});
```

### Available Operators

| Operator | Description | Example | Types |
|----------|-------------|---------|-------|
| `$eq` | Equal to | `{ age: { $eq: 25 } }` | All |
| `$ne` | Not equal to | `{ status: { $ne: 'inactive' } }` | All |
| `$gt` | Greater than | `{ price: { $gt: 100 } }` | Number, Date |
| `$gte` | Greater than or equal | `{ age: { $gte: 18 } }` | Number, Date |
| `$lt` | Less than | `{ quantity: { $lt: 10 } }` | Number, Date |
| `$lte` | Less than or equal | `{ age: { $lte: 65 } }` | Number, Date |
| `$in` | In array | `{ id: { $in: ['a', 'b'] } }` | All |
| `$nin` | Not in array | `{ role: { $nin: ['admin'] } }` | All |
| `$like` | Pattern match (case-sensitive) | `{ name: { $like: '%John%' } }` | String |
| `$ilike` | Pattern match (case-insensitive) | `{ email: { $ilike: '%@GMAIL%' } }` | String |
| `$is` | IS NULL | `{ deleted_at: { $is: null } }` | Nullable fields |
| `$isNot` | IS NOT NULL | `{ created_by: { $isNot: null } }` | Nullable fields |

### Logical Operators

Combine conditions using `$or` and `$and` (supports 2 levels of nesting):

| Operator | Description | Example |
|----------|-------------|---------|
| `$or` | Match any condition | `{ $or: [{ status: 'active' }, { role: 'admin' }] }` |
| `$and` | Match all conditions (explicit) | `{ $and: [{ age: { $gte: 18 } }, { status: 'verified' }] }` |

```typescript
// OR - match any condition
const results = await sdk.users.list({
  where: {
    $or: [
      { email: { $ilike: '%@gmail.com' } },
      { status: 'premium' }
    ]
  }
});

// Mixed AND + OR (implicit AND at root level)
const complex = await sdk.users.list({
  where: {
    status: 'active',  // AND
    $or: [
      { age: { $lt: 18 } },
      { age: { $gt: 65 } }
    ]
  }
});

// Nested (2 levels max)
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
```

**Note:** The WHERE clause types are fully type-safe. TypeScript will only allow operators that are valid for each field type.

## Sorting

Sort query results using the `orderBy` and `order` parameters. Supports both single and multi-column sorting.

### Single Column Sorting

```typescript
// Sort by one column ascending
const users = await sdk.users.list({
  orderBy: 'created_at',
  order: 'asc'
});

// Sort descending
const latest = await sdk.users.list({
  orderBy: 'created_at',
  order: 'desc'
});

// Order defaults to 'asc' if not specified
const sorted = await sdk.users.list({
  orderBy: 'name'
});
```

### Multi-Column Sorting

```typescript
// Sort by multiple columns (all same direction)
const users = await sdk.users.list({
  orderBy: ['status', 'created_at'],
  order: 'desc'
});

// Different direction per column
const sorted = await sdk.users.list({
  orderBy: ['status', 'created_at'],
  order: ['asc', 'desc']  // status ASC, created_at DESC
});
```

### Combining Sorting with Filters

```typescript
const results = await sdk.users.list({
  where: {
    status: 'active',
    age: { $gte: 18 }
  },
  orderBy: 'created_at',
  order: 'desc',
  limit: 50,
  offset: 0
});
```

**Note:** Column names are validated by Zod schemas. Only valid table columns are accepted, preventing SQL injection.

## Resources

### Authors

Resource for authors operations

#### SDK Methods

Access via: `sdk.authors`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Authors>>`
- List authors with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/authors`

```typescript
// Get all authors
const result = await sdk.authors.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.authors.list({
  limit: 20,
  offset: 0,
  where: { id: { $like: '%search%' } },
  orderBy: 'id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Authors | null>`
- Get a single authors by primary key
- API: `GET /v1/authors/:id`

```typescript
// Get by ID
const item = await sdk.authors.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
```

**create**
- Signature: `create(data: InsertAuthors): Promise<Authors>`
- Create a new authors
- API: `POST /v1/authors`

```typescript
import type { InsertAuthors } from './client/types/authors';

const newItem: InsertAuthors = {
    name: 'John Doe'
};

const created = await sdk.authors.create(newItem);
console.log('Created:', created.id);
```

**update**
- Signature: `update(id: string, data: UpdateAuthors): Promise<Authors>`
- Update an existing authors
- API: `PATCH /v1/authors/:id`

```typescript
import type { UpdateAuthors } from './client/types/authors';

const updates: UpdateAuthors = {
    name: 'John Doe'
};

const updated = await sdk.authors.update('123', updates);
```

**delete**
- Signature: `delete(id: string): Promise<Authors>`
- Delete a authors
- API: `DELETE /v1/authors/:id`

```typescript
const deleted = await sdk.authors.delete('123');
console.log('Deleted:', deleted);
```

**listWithBooks**
- Signature: `listWithBooks(params?: ListParams): PaginatedResponse<SelectAuthors & { books: SelectBooks[] }>`
- Get authors with included books data
- API: `POST /v1/authors/list`

```typescript
const result = await sdk.authors.listWithBooks();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.authors.listWithBooks({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithBooks**
- Signature: `getByPkWithBooks(id: string): SelectAuthors & { books: SelectBooks[] } | null`
- Get authors with included books data
- API: `POST /v1/authors/list`

```typescript
const result = await sdk.authors.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');
```

**listWithBooksAndTags**
- Signature: `listWithBooksAndTags(params?: ListParams): PaginatedResponse<SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] }>`
- Get authors with included books, tags data
- API: `POST /v1/authors/list`

```typescript
const result = await sdk.authors.listWithBooksAndTags();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.authors.listWithBooksAndTags({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithBooksAndTags**
- Signature: `getByPkWithBooksAndTags(id: string): SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] } | null`
- Get authors with included books, tags data
- API: `POST /v1/authors/list`

```typescript
const result = await sdk.authors.getByPkWithBooksAndTags('123e4567-e89b-12d3-a456-426614174000');
```

#### API Endpoints

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
- `DELETE /v1/authors/:id`
  - Delete authors
  - Response: `Authors`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |

### BookTags

Resource for book_tags operations

#### SDK Methods

Access via: `sdk.book_tags`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<BookTags>>`
- List book_tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/book_tags`

```typescript
// Get all book_tags
const result = await sdk.book_tags.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.book_tags.list({
  limit: 20,
  offset: 0,
  where: { book_id: { $like: '%search%' } },
  orderBy: 'book_id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**create**
- Signature: `create(data: InsertBookTags): Promise<BookTags>`
- Create a new book_tags
- API: `POST /v1/book_tags`

```typescript
import type { InsertBookTags } from './client/types/book_tags';

const newItem: InsertBookTags = {
    book_id: 'related-id-123',
  tag_id: 'related-id-123'
};

const created = await sdk.book_tags.create(newItem);
console.log('Created:', created.id);
```

#### API Endpoints

- `GET /v1/book_tags`
  - List all book_tags records with pagination metadata
  - Response: `PaginatedResponse<BookTags>`
- `POST /v1/book_tags`
  - Create new book_tags
  - Request: `InsertBookTags`
  - Response: `BookTags`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| book_id | uuid | `string` | ✓ | Foreign key to book → books |
| tag_id | uuid | `string` | ✓ | Foreign key to tag → tags |

### Books

Resource for books operations

#### SDK Methods

Access via: `sdk.books`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Books>>`
- List books with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/books`

```typescript
// Get all books
const result = await sdk.books.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.books.list({
  limit: 20,
  offset: 0,
  where: { id: { $like: '%search%' } },
  orderBy: 'id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Books | null>`
- Get a single books by primary key
- API: `GET /v1/books/:id`

```typescript
// Get by ID
const item = await sdk.books.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
```

**create**
- Signature: `create(data: InsertBooks): Promise<Books>`
- Create a new books
- API: `POST /v1/books`

```typescript
import type { InsertBooks } from './client/types/books';

const newItem: InsertBooks = {
    author_id: 'related-id-123',
  title: 'Example Title'
};

const created = await sdk.books.create(newItem);
console.log('Created:', created.id);
```

**update**
- Signature: `update(id: string, data: UpdateBooks): Promise<Books>`
- Update an existing books
- API: `PATCH /v1/books/:id`

```typescript
import type { UpdateBooks } from './client/types/books';

const updates: UpdateBooks = {
    author_id: 'related-id-123',
  title: 'Example Title'
};

const updated = await sdk.books.update('123', updates);
```

**delete**
- Signature: `delete(id: string): Promise<Books>`
- Delete a books
- API: `DELETE /v1/books/:id`

```typescript
const deleted = await sdk.books.delete('123');
console.log('Deleted:', deleted);
```

**listWithAuthor**
- Signature: `listWithAuthor(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors }>`
- Get books with included author data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.listWithAuthor();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.books.listWithAuthor({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithAuthor**
- Signature: `getByPkWithAuthor(id: string): SelectBooks & { author: SelectAuthors } | null`
- Get books with included author data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.getByPkWithAuthor('123e4567-e89b-12d3-a456-426614174000');
```

**listWithTags**
- Signature: `listWithTags(params?: ListParams): PaginatedResponse<SelectBooks & { tags: SelectTags[] }>`
- Get books with included tags data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.listWithTags();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.books.listWithTags({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithTags**
- Signature: `getByPkWithTags(id: string): SelectBooks & { tags: SelectTags[] } | null`
- Get books with included tags data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.getByPkWithTags('123e4567-e89b-12d3-a456-426614174000');
```

**listWithAuthorAndTags**
- Signature: `listWithAuthorAndTags(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors; tags: SelectTags[] }>`
- Get books with included author, tags data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.listWithAuthorAndTags();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.books.listWithAuthorAndTags({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithAuthorAndTags**
- Signature: `getByPkWithAuthorAndTags(id: string): (SelectBooks & { author: SelectAuthors; tags: SelectTags[] }) | null`
- Get books with included author, tags data
- API: `POST /v1/books/list`

```typescript
const result = await sdk.books.getByPkWithAuthorAndTags('123e4567-e89b-12d3-a456-426614174000');
```

#### API Endpoints

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
- `DELETE /v1/books/:id`
  - Delete books
  - Response: `Books`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| author_id | uuid | `string | null` |  | Foreign key to author → authors |
| title | string | `string` | ✓ | title |

### Products

Resource for products operations

#### SDK Methods

Access via: `sdk.products`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Products>>`
- List products with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/products`

```typescript
// Get all products
const result = await sdk.products.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.products.list({
  limit: 20,
  offset: 0,
  where: { id: { $like: '%search%' } },
  orderBy: 'id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Products | null>`
- Get a single products by primary key
- API: `GET /v1/products/:id`

```typescript
// Get by ID
const item = await sdk.products.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
```

**create**
- Signature: `create(data: InsertProducts): Promise<Products>`
- Create a new products
- API: `POST /v1/products`

```typescript
import type { InsertProducts } from './client/types/products';

const newItem: InsertProducts = {
    name: 'John Doe',
  status: 'active',
  priority: 'example value'
};

const created = await sdk.products.create(newItem);
console.log('Created:', created.id);
```

**update**
- Signature: `update(id: string, data: UpdateProducts): Promise<Products>`
- Update an existing products
- API: `PATCH /v1/products/:id`

```typescript
import type { UpdateProducts } from './client/types/products';

const updates: UpdateProducts = {
    name: 'John Doe',
  status: 'active'
};

const updated = await sdk.products.update('123', updates);
```

**delete**
- Signature: `delete(id: string): Promise<Products>`
- Delete a products
- API: `DELETE /v1/products/:id`

```typescript
const deleted = await sdk.products.delete('123');
console.log('Deleted:', deleted);
```

#### API Endpoints

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
- `DELETE /v1/products/:id`
  - Delete products
  - Response: `Products`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |
| status | product_status | `"draft" | "published" | "archived"` |  | status |
| priority | priority_level | `"low" | "medium" | "high" | "critical"` | ✓ | priority |
| tags | user_role[] | `("admin" | "moderator" | "user" | "guest")[] | null` |  | tags |

### Tags

Resource for tags operations

#### SDK Methods

Access via: `sdk.tags`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Tags>>`
- List tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/tags`

```typescript
// Get all tags
const result = await sdk.tags.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.tags.list({
  limit: 20,
  offset: 0,
  where: { id: { $like: '%search%' } },
  orderBy: 'id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Tags | null>`
- Get a single tags by primary key
- API: `GET /v1/tags/:id`

```typescript
// Get by ID
const item = await sdk.tags.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
```

**create**
- Signature: `create(data: InsertTags): Promise<Tags>`
- Create a new tags
- API: `POST /v1/tags`

```typescript
import type { InsertTags } from './client/types/tags';

const newItem: InsertTags = {
    name: 'John Doe'
};

const created = await sdk.tags.create(newItem);
console.log('Created:', created.id);
```

**update**
- Signature: `update(id: string, data: UpdateTags): Promise<Tags>`
- Update an existing tags
- API: `PATCH /v1/tags/:id`

```typescript
import type { UpdateTags } from './client/types/tags';

const updates: UpdateTags = {
    name: 'John Doe'
};

const updated = await sdk.tags.update('123', updates);
```

**delete**
- Signature: `delete(id: string): Promise<Tags>`
- Delete a tags
- API: `DELETE /v1/tags/:id`

```typescript
const deleted = await sdk.tags.delete('123');
console.log('Deleted:', deleted);
```

**listWithBooks**
- Signature: `listWithBooks(params?: ListParams): PaginatedResponse<SelectTags & { books: SelectBooks[] }>`
- Get tags with included books data
- API: `POST /v1/tags/list`

```typescript
const result = await sdk.tags.listWithBooks();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.tags.listWithBooks({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithBooks**
- Signature: `getByPkWithBooks(id: string): SelectTags & { books: SelectBooks[] } | null`
- Get tags with included books data
- API: `POST /v1/tags/list`

```typescript
const result = await sdk.tags.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');
```

**listWithBooksAndAuthor**
- Signature: `listWithBooksAndAuthor(params?: ListParams): PaginatedResponse<SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] }>`
- Get tags with included books, author data
- API: `POST /v1/tags/list`

```typescript
const result = await sdk.tags.listWithBooksAndAuthor();
console.log(result.data);    // array of records with includes
console.log(result.total);   // total count
console.log(result.hasMore); // more pages available

// With filters and pagination
const filtered = await sdk.tags.listWithBooksAndAuthor({
  limit: 20,
  offset: 0,
  where: { /* filter conditions */ }
});
```

**getByPkWithBooksAndAuthor**
- Signature: `getByPkWithBooksAndAuthor(id: string): SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] } | null`
- Get tags with included books, author data
- API: `POST /v1/tags/list`

```typescript
const result = await sdk.tags.getByPkWithBooksAndAuthor('123e4567-e89b-12d3-a456-426614174000');
```

#### API Endpoints

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
- `DELETE /v1/tags/:id`
  - Delete tags
  - Response: `Tags`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| name | string | `string` | ✓ | name |

### Users

Resource for users operations

#### SDK Methods

Access via: `sdk.users`

**list**
- Signature: `list(params?: ListParams): Promise<PaginatedResponse<Users>>`
- List users with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: `GET /v1/users`

```typescript
// Get all users
const result = await sdk.users.list();
console.log(result.data);        // array of records
console.log(result.total);       // total matching records
console.log(result.hasMore);     // true if more pages available

// With filters and pagination
const filtered = await sdk.users.list({
  limit: 20,
  offset: 0,
  where: { id: { $like: '%search%' } },
  orderBy: 'id',
  order: 'desc'
});

// Calculate total pages
const totalPages = Math.ceil(filtered.total / filtered.limit);
const currentPage = Math.floor(filtered.offset / filtered.limit) + 1;
```

**getByPk**
- Signature: `getByPk(id: string): Promise<Users | null>`
- Get a single users by primary key
- API: `GET /v1/users/:id`

```typescript
// Get by ID
const item = await sdk.users.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
```

**create**
- Signature: `create(data: InsertUsers): Promise<Users>`
- Create a new users
- API: `POST /v1/users`

```typescript
import type { InsertUsers } from './client/types/users';

const newItem: InsertUsers = {
    email: 'user@example.com',
  role: 'example value',
  backup_role: 'example value'
};

const created = await sdk.users.create(newItem);
console.log('Created:', created.id);
```

**update**
- Signature: `update(id: string, data: UpdateUsers): Promise<Users>`
- Update an existing users
- API: `PATCH /v1/users/:id`

```typescript
import type { UpdateUsers } from './client/types/users';

const updates: UpdateUsers = {
    email: 'user@example.com',
  role: 'example value'
};

const updated = await sdk.users.update('123', updates);
```

**delete**
- Signature: `delete(id: string): Promise<Users>`
- Delete a users
- API: `DELETE /v1/users/:id`

```typescript
const deleted = await sdk.users.delete('123');
console.log('Deleted:', deleted);
```

#### API Endpoints

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
- `DELETE /v1/users/:id`
  - Delete users
  - Response: `Users`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | `string` |  | Primary key |
| email | string | `string` | ✓ | email |
| role | user_role | `"admin" | "moderator" | "user" | "guest"` |  | role |
| backup_role | user_role | `"admin" | "moderator" | "user" | "guest" | null` |  | backup role |

## Relationships

- **book_tags** → **books** (many-to-one): Each book_tags belongs to one books
- **book_tags** → **tags** (many-to-one): Each book_tags belongs to one tags
- **books** → **authors** (many-to-one): Each books belongs to one authors

## Type Imports

```typescript
// Import SDK and types
import { SDK } from './client';

// Import types for a specific table
import type {
  SelectTableName,  // Full record type
  InsertTableName,  // Create payload type
  UpdateTableName   // Update payload type
} from './client/types/table_name';

// Import all types
import type * as Types from './client/types';
```
