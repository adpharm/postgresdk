/**
 * Unified API & SDK Contract
 * 
 * This module exports a comprehensive contract that describes both
 * API endpoints and SDK usage for all resources.
 * 
 * Use this as your primary reference for:
 * - SDK initialization and authentication
 * - Available methods and their signatures
 * - API endpoints and parameters
 * - Type definitions and relationships
 */

export const contract = {
  "version": "2.0.0",
  "generatedAt": "2025-11-20T22:28:26.796Z",
  "description": "Unified API and SDK contract - your one-stop reference for all operations",
  "sdk": {
    "initialization": [
      {
        "description": "Basic initialization",
        "code": "import { SDK } from './client';\n\nconst sdk = new SDK({\n  baseUrl: 'http://localhost:3000'\n});"
      },
      {
        "description": "With authentication",
        "code": "import { SDK } from './client';\n\nconst sdk = new SDK({\n  baseUrl: 'https://api.example.com',\n  auth: {\n    apiKey: process.env.API_KEY\n  }\n});"
      },
      {
        "description": "With custom fetch (for Node.js < 18)",
        "code": "import { SDK } from './client';\nimport fetch from 'node-fetch';\n\nconst sdk = new SDK({\n  baseUrl: 'https://api.example.com',\n  fetch: fetch as any\n});"
      }
    ],
    "authentication": [
      {
        "strategy": "none",
        "description": "No authentication required",
        "code": "const sdk = new SDK({\n  baseUrl: 'http://localhost:3000'\n});"
      },
      {
        "strategy": "custom",
        "description": "Custom headers provider",
        "code": "const sdk = new SDK({\n  baseUrl: 'https://api.example.com',\n  auth: async () => ({\n    'Authorization': 'Bearer ' + await getToken(),\n    'X-Request-ID': generateRequestId()\n  })\n});"
      }
    ]
  },
  "resources": [
    {
      "name": "Authors",
      "tableName": "authors",
      "description": "Resource for authors operations",
      "sdk": {
        "client": "sdk.authors",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<Authors>>",
            "description": "List authors with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all authors\nconst result = await sdk.authors.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.authors.list({\n  limit: 20,\n  offset: 0,\n  where: { id: { $like: '%search%' } },\n  orderBy: 'id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/authors"
          },
          {
            "name": "getByPk",
            "signature": "getByPk(id: string): Promise<Authors | null>",
            "description": "Get a single authors by primary key",
            "example": "// Get by ID\nconst item = await sdk.authors.getByPk('123e4567-e89b-12d3-a456-426614174000');\n\n// Check if exists\nif (item === null) {\n  console.log('Not found');\n}",
            "correspondsTo": "GET /v1/authors/:id"
          },
          {
            "name": "create",
            "signature": "create(data: InsertAuthors): Promise<Authors>",
            "description": "Create a new authors",
            "example": "import type { InsertAuthors } from './client/types/authors';\n\nconst newItem: InsertAuthors = {\n    name: 'John Doe'\n};\n\nconst created = await sdk.authors.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/authors"
          },
          {
            "name": "update",
            "signature": "update(id: string, data: UpdateAuthors): Promise<Authors>",
            "description": "Update an existing authors",
            "example": "import type { UpdateAuthors } from './client/types/authors';\n\nconst updates: UpdateAuthors = {\n    name: 'John Doe'\n};\n\nconst updated = await sdk.authors.update('123', updates);",
            "correspondsTo": "PATCH /v1/authors/:id"
          },
          {
            "name": "delete",
            "signature": "delete(id: string): Promise<Authors>",
            "description": "Delete a authors",
            "example": "const deleted = await sdk.authors.delete('123');\nconsole.log('Deleted:', deleted);",
            "correspondsTo": "DELETE /v1/authors/:id"
          },
          {
            "name": "listWithBooks",
            "signature": "listWithBooks(params?: ListParams): PaginatedResponse<SelectAuthors & { books: SelectBooks[] }>",
            "description": "Get authors with included books data",
            "example": "const result = await sdk.authors.listWithBooks();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.authors.listWithBooks({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/authors/list"
          },
          {
            "name": "getByPkWithBooks",
            "signature": "getByPkWithBooks(id: string): SelectAuthors & { books: SelectBooks[] } | null",
            "description": "Get authors with included books data",
            "example": "const result = await sdk.authors.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/authors/list"
          },
          {
            "name": "listWithBooksAndTags",
            "signature": "listWithBooksAndTags(params?: ListParams): PaginatedResponse<SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] }>",
            "description": "Get authors with included books, tags data",
            "example": "const result = await sdk.authors.listWithBooksAndTags();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.authors.listWithBooksAndTags({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/authors/list"
          },
          {
            "name": "getByPkWithBooksAndTags",
            "signature": "getByPkWithBooksAndTags(id: string): SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] } | null",
            "description": "Get authors with included books, tags data",
            "example": "const result = await sdk.authors.getByPkWithBooksAndTags('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/authors/list"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/authors",
            "description": "List all authors records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "id": "uuid - Filter by id",
              "name": "string - Filter by name",
              "name_like": "string - Search in name",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<Authors>"
          },
          {
            "method": "GET",
            "path": "/v1/authors/:id",
            "description": "Get authors by ID",
            "responseBody": "Authors"
          },
          {
            "method": "POST",
            "path": "/v1/authors",
            "description": "Create new authors",
            "requestBody": "InsertAuthors",
            "responseBody": "Authors"
          },
          {
            "method": "PATCH",
            "path": "/v1/authors/:id",
            "description": "Update authors",
            "requestBody": "UpdateAuthors",
            "responseBody": "Authors"
          },
          {
            "method": "DELETE",
            "path": "/v1/authors/:id",
            "description": "Delete authors",
            "responseBody": "Authors"
          }
        ]
      },
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "tsType": "string",
          "required": false,
          "description": "Primary key"
        },
        {
          "name": "name",
          "type": "string",
          "tsType": "string",
          "required": true,
          "description": "name"
        }
      ]
    },
    {
      "name": "BookTags",
      "tableName": "book_tags",
      "description": "Resource for book_tags operations",
      "sdk": {
        "client": "sdk.book_tags",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<BookTags>>",
            "description": "List book_tags with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all book_tags\nconst result = await sdk.book_tags.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.book_tags.list({\n  limit: 20,\n  offset: 0,\n  where: { book_id: { $like: '%search%' } },\n  orderBy: 'book_id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/book_tags"
          },
          {
            "name": "create",
            "signature": "create(data: InsertBookTags): Promise<BookTags>",
            "description": "Create a new book_tags",
            "example": "import type { InsertBookTags } from './client/types/book_tags';\n\nconst newItem: InsertBookTags = {\n    book_id: 'related-id-123',\n  tag_id: 'related-id-123'\n};\n\nconst created = await sdk.book_tags.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/book_tags"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/book_tags",
            "description": "List all book_tags records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "book_id": "uuid - Filter by book_id",
              "tag_id": "uuid - Filter by tag_id",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<BookTags>"
          },
          {
            "method": "POST",
            "path": "/v1/book_tags",
            "description": "Create new book_tags",
            "requestBody": "InsertBookTags",
            "responseBody": "BookTags"
          }
        ]
      },
      "fields": [
        {
          "name": "book_id",
          "type": "uuid",
          "tsType": "string",
          "required": true,
          "description": "Foreign key to book",
          "foreignKey": {
            "table": "books",
            "field": "id"
          }
        },
        {
          "name": "tag_id",
          "type": "uuid",
          "tsType": "string",
          "required": true,
          "description": "Foreign key to tag",
          "foreignKey": {
            "table": "tags",
            "field": "id"
          }
        }
      ]
    },
    {
      "name": "Books",
      "tableName": "books",
      "description": "Resource for books operations",
      "sdk": {
        "client": "sdk.books",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<Books>>",
            "description": "List books with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all books\nconst result = await sdk.books.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.books.list({\n  limit: 20,\n  offset: 0,\n  where: { id: { $like: '%search%' } },\n  orderBy: 'id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/books"
          },
          {
            "name": "getByPk",
            "signature": "getByPk(id: string): Promise<Books | null>",
            "description": "Get a single books by primary key",
            "example": "// Get by ID\nconst item = await sdk.books.getByPk('123e4567-e89b-12d3-a456-426614174000');\n\n// Check if exists\nif (item === null) {\n  console.log('Not found');\n}",
            "correspondsTo": "GET /v1/books/:id"
          },
          {
            "name": "create",
            "signature": "create(data: InsertBooks): Promise<Books>",
            "description": "Create a new books",
            "example": "import type { InsertBooks } from './client/types/books';\n\nconst newItem: InsertBooks = {\n    author_id: 'related-id-123',\n  title: 'Example Title'\n};\n\nconst created = await sdk.books.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/books"
          },
          {
            "name": "update",
            "signature": "update(id: string, data: UpdateBooks): Promise<Books>",
            "description": "Update an existing books",
            "example": "import type { UpdateBooks } from './client/types/books';\n\nconst updates: UpdateBooks = {\n    author_id: 'related-id-123',\n  title: 'Example Title'\n};\n\nconst updated = await sdk.books.update('123', updates);",
            "correspondsTo": "PATCH /v1/books/:id"
          },
          {
            "name": "delete",
            "signature": "delete(id: string): Promise<Books>",
            "description": "Delete a books",
            "example": "const deleted = await sdk.books.delete('123');\nconsole.log('Deleted:', deleted);",
            "correspondsTo": "DELETE /v1/books/:id"
          },
          {
            "name": "listWithAuthor",
            "signature": "listWithAuthor(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors }>",
            "description": "Get books with included author data",
            "example": "const result = await sdk.books.listWithAuthor();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.books.listWithAuthor({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/books/list"
          },
          {
            "name": "getByPkWithAuthor",
            "signature": "getByPkWithAuthor(id: string): SelectBooks & { author: SelectAuthors } | null",
            "description": "Get books with included author data",
            "example": "const result = await sdk.books.getByPkWithAuthor('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/books/list"
          },
          {
            "name": "listWithTags",
            "signature": "listWithTags(params?: ListParams): PaginatedResponse<SelectBooks & { tags: SelectTags[] }>",
            "description": "Get books with included tags data",
            "example": "const result = await sdk.books.listWithTags();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.books.listWithTags({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/books/list"
          },
          {
            "name": "getByPkWithTags",
            "signature": "getByPkWithTags(id: string): SelectBooks & { tags: SelectTags[] } | null",
            "description": "Get books with included tags data",
            "example": "const result = await sdk.books.getByPkWithTags('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/books/list"
          },
          {
            "name": "listWithAuthorAndTags",
            "signature": "listWithAuthorAndTags(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors; tags: SelectTags[] }>",
            "description": "Get books with included author, tags data",
            "example": "const result = await sdk.books.listWithAuthorAndTags();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.books.listWithAuthorAndTags({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/books/list"
          },
          {
            "name": "getByPkWithAuthorAndTags",
            "signature": "getByPkWithAuthorAndTags(id: string): (SelectBooks & { author: SelectAuthors; tags: SelectTags[] }) | null",
            "description": "Get books with included author, tags data",
            "example": "const result = await sdk.books.getByPkWithAuthorAndTags('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/books/list"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/books",
            "description": "List all books records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "id": "uuid - Filter by id",
              "author_id": "uuid - Filter by author_id",
              "title": "string - Filter by title",
              "title_like": "string - Search in title",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<Books>"
          },
          {
            "method": "GET",
            "path": "/v1/books/:id",
            "description": "Get books by ID",
            "responseBody": "Books"
          },
          {
            "method": "POST",
            "path": "/v1/books",
            "description": "Create new books",
            "requestBody": "InsertBooks",
            "responseBody": "Books"
          },
          {
            "method": "PATCH",
            "path": "/v1/books/:id",
            "description": "Update books",
            "requestBody": "UpdateBooks",
            "responseBody": "Books"
          },
          {
            "method": "DELETE",
            "path": "/v1/books/:id",
            "description": "Delete books",
            "responseBody": "Books"
          }
        ]
      },
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "tsType": "string",
          "required": false,
          "description": "Primary key"
        },
        {
          "name": "author_id",
          "type": "uuid",
          "tsType": "string | null",
          "required": false,
          "description": "Foreign key to author",
          "foreignKey": {
            "table": "authors",
            "field": "id"
          }
        },
        {
          "name": "title",
          "type": "string",
          "tsType": "string",
          "required": true,
          "description": "title"
        }
      ]
    },
    {
      "name": "Products",
      "tableName": "products",
      "description": "Resource for products operations",
      "sdk": {
        "client": "sdk.products",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<Products>>",
            "description": "List products with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all products\nconst result = await sdk.products.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.products.list({\n  limit: 20,\n  offset: 0,\n  where: { id: { $like: '%search%' } },\n  orderBy: 'id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/products"
          },
          {
            "name": "getByPk",
            "signature": "getByPk(id: string): Promise<Products | null>",
            "description": "Get a single products by primary key",
            "example": "// Get by ID\nconst item = await sdk.products.getByPk('123e4567-e89b-12d3-a456-426614174000');\n\n// Check if exists\nif (item === null) {\n  console.log('Not found');\n}",
            "correspondsTo": "GET /v1/products/:id"
          },
          {
            "name": "create",
            "signature": "create(data: InsertProducts): Promise<Products>",
            "description": "Create a new products",
            "example": "import type { InsertProducts } from './client/types/products';\n\nconst newItem: InsertProducts = {\n    name: 'John Doe',\n  status: 'active',\n  priority: 'example value'\n};\n\nconst created = await sdk.products.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/products"
          },
          {
            "name": "update",
            "signature": "update(id: string, data: UpdateProducts): Promise<Products>",
            "description": "Update an existing products",
            "example": "import type { UpdateProducts } from './client/types/products';\n\nconst updates: UpdateProducts = {\n    name: 'John Doe',\n  status: 'active'\n};\n\nconst updated = await sdk.products.update('123', updates);",
            "correspondsTo": "PATCH /v1/products/:id"
          },
          {
            "name": "delete",
            "signature": "delete(id: string): Promise<Products>",
            "description": "Delete a products",
            "example": "const deleted = await sdk.products.delete('123');\nconsole.log('Deleted:', deleted);",
            "correspondsTo": "DELETE /v1/products/:id"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/products",
            "description": "List all products records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "id": "uuid - Filter by id",
              "name": "string - Filter by name",
              "name_like": "string - Search in name",
              "status": "product_status - Filter by status",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<Products>"
          },
          {
            "method": "GET",
            "path": "/v1/products/:id",
            "description": "Get products by ID",
            "responseBody": "Products"
          },
          {
            "method": "POST",
            "path": "/v1/products",
            "description": "Create new products",
            "requestBody": "InsertProducts",
            "responseBody": "Products"
          },
          {
            "method": "PATCH",
            "path": "/v1/products/:id",
            "description": "Update products",
            "requestBody": "UpdateProducts",
            "responseBody": "Products"
          },
          {
            "method": "DELETE",
            "path": "/v1/products/:id",
            "description": "Delete products",
            "responseBody": "Products"
          }
        ]
      },
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "tsType": "string",
          "required": false,
          "description": "Primary key"
        },
        {
          "name": "name",
          "type": "string",
          "tsType": "string",
          "required": true,
          "description": "name"
        },
        {
          "name": "status",
          "type": "product_status",
          "tsType": "\"draft\" | \"published\" | \"archived\"",
          "required": false,
          "description": "status"
        },
        {
          "name": "priority",
          "type": "priority_level",
          "tsType": "\"low\" | \"medium\" | \"high\" | \"critical\"",
          "required": true,
          "description": "priority"
        },
        {
          "name": "tags",
          "type": "user_role[]",
          "tsType": "(\"admin\" | \"moderator\" | \"user\" | \"guest\")[] | null",
          "required": false,
          "description": "tags"
        }
      ]
    },
    {
      "name": "Tags",
      "tableName": "tags",
      "description": "Resource for tags operations",
      "sdk": {
        "client": "sdk.tags",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<Tags>>",
            "description": "List tags with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all tags\nconst result = await sdk.tags.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.tags.list({\n  limit: 20,\n  offset: 0,\n  where: { id: { $like: '%search%' } },\n  orderBy: 'id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/tags"
          },
          {
            "name": "getByPk",
            "signature": "getByPk(id: string): Promise<Tags | null>",
            "description": "Get a single tags by primary key",
            "example": "// Get by ID\nconst item = await sdk.tags.getByPk('123e4567-e89b-12d3-a456-426614174000');\n\n// Check if exists\nif (item === null) {\n  console.log('Not found');\n}",
            "correspondsTo": "GET /v1/tags/:id"
          },
          {
            "name": "create",
            "signature": "create(data: InsertTags): Promise<Tags>",
            "description": "Create a new tags",
            "example": "import type { InsertTags } from './client/types/tags';\n\nconst newItem: InsertTags = {\n    name: 'John Doe'\n};\n\nconst created = await sdk.tags.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/tags"
          },
          {
            "name": "update",
            "signature": "update(id: string, data: UpdateTags): Promise<Tags>",
            "description": "Update an existing tags",
            "example": "import type { UpdateTags } from './client/types/tags';\n\nconst updates: UpdateTags = {\n    name: 'John Doe'\n};\n\nconst updated = await sdk.tags.update('123', updates);",
            "correspondsTo": "PATCH /v1/tags/:id"
          },
          {
            "name": "delete",
            "signature": "delete(id: string): Promise<Tags>",
            "description": "Delete a tags",
            "example": "const deleted = await sdk.tags.delete('123');\nconsole.log('Deleted:', deleted);",
            "correspondsTo": "DELETE /v1/tags/:id"
          },
          {
            "name": "listWithBooks",
            "signature": "listWithBooks(params?: ListParams): PaginatedResponse<SelectTags & { books: SelectBooks[] }>",
            "description": "Get tags with included books data",
            "example": "const result = await sdk.tags.listWithBooks();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.tags.listWithBooks({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/tags/list"
          },
          {
            "name": "getByPkWithBooks",
            "signature": "getByPkWithBooks(id: string): SelectTags & { books: SelectBooks[] } | null",
            "description": "Get tags with included books data",
            "example": "const result = await sdk.tags.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/tags/list"
          },
          {
            "name": "listWithBooksAndAuthor",
            "signature": "listWithBooksAndAuthor(params?: ListParams): PaginatedResponse<SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] }>",
            "description": "Get tags with included books, author data",
            "example": "const result = await sdk.tags.listWithBooksAndAuthor();\nconsole.log(result.data);    // array of records with includes\nconsole.log(result.total);   // total count\nconsole.log(result.hasMore); // more pages available\n\n// With filters and pagination\nconst filtered = await sdk.tags.listWithBooksAndAuthor({\n  limit: 20,\n  offset: 0,\n  where: { /* filter conditions */ }\n});",
            "correspondsTo": "POST /v1/tags/list"
          },
          {
            "name": "getByPkWithBooksAndAuthor",
            "signature": "getByPkWithBooksAndAuthor(id: string): SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] } | null",
            "description": "Get tags with included books, author data",
            "example": "const result = await sdk.tags.getByPkWithBooksAndAuthor('123e4567-e89b-12d3-a456-426614174000');",
            "correspondsTo": "POST /v1/tags/list"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/tags",
            "description": "List all tags records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "id": "uuid - Filter by id",
              "name": "string - Filter by name",
              "name_like": "string - Search in name",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<Tags>"
          },
          {
            "method": "GET",
            "path": "/v1/tags/:id",
            "description": "Get tags by ID",
            "responseBody": "Tags"
          },
          {
            "method": "POST",
            "path": "/v1/tags",
            "description": "Create new tags",
            "requestBody": "InsertTags",
            "responseBody": "Tags"
          },
          {
            "method": "PATCH",
            "path": "/v1/tags/:id",
            "description": "Update tags",
            "requestBody": "UpdateTags",
            "responseBody": "Tags"
          },
          {
            "method": "DELETE",
            "path": "/v1/tags/:id",
            "description": "Delete tags",
            "responseBody": "Tags"
          }
        ]
      },
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "tsType": "string",
          "required": false,
          "description": "Primary key"
        },
        {
          "name": "name",
          "type": "string",
          "tsType": "string",
          "required": true,
          "description": "name"
        }
      ]
    },
    {
      "name": "Users",
      "tableName": "users",
      "description": "Resource for users operations",
      "sdk": {
        "client": "sdk.users",
        "methods": [
          {
            "name": "list",
            "signature": "list(params?: ListParams): Promise<PaginatedResponse<Users>>",
            "description": "List users with filtering, sorting, and pagination. Returns paginated results with metadata.",
            "example": "// Get all users\nconst result = await sdk.users.list();\nconsole.log(result.data);        // array of records\nconsole.log(result.total);       // total matching records\nconsole.log(result.hasMore);     // true if more pages available\n\n// With filters and pagination\nconst filtered = await sdk.users.list({\n  limit: 20,\n  offset: 0,\n  where: { id: { $like: '%search%' } },\n  orderBy: 'id',\n  order: 'desc'\n});\n\n// Calculate total pages\nconst totalPages = Math.ceil(filtered.total / filtered.limit);\nconst currentPage = Math.floor(filtered.offset / filtered.limit) + 1;",
            "correspondsTo": "GET /v1/users"
          },
          {
            "name": "getByPk",
            "signature": "getByPk(id: string): Promise<Users | null>",
            "description": "Get a single users by primary key",
            "example": "// Get by ID\nconst item = await sdk.users.getByPk('123e4567-e89b-12d3-a456-426614174000');\n\n// Check if exists\nif (item === null) {\n  console.log('Not found');\n}",
            "correspondsTo": "GET /v1/users/:id"
          },
          {
            "name": "create",
            "signature": "create(data: InsertUsers): Promise<Users>",
            "description": "Create a new users",
            "example": "import type { InsertUsers } from './client/types/users';\n\nconst newItem: InsertUsers = {\n    email: 'user@example.com',\n  role: 'example value',\n  backup_role: 'example value'\n};\n\nconst created = await sdk.users.create(newItem);\nconsole.log('Created:', created.id);",
            "correspondsTo": "POST /v1/users"
          },
          {
            "name": "update",
            "signature": "update(id: string, data: UpdateUsers): Promise<Users>",
            "description": "Update an existing users",
            "example": "import type { UpdateUsers } from './client/types/users';\n\nconst updates: UpdateUsers = {\n    email: 'user@example.com',\n  role: 'example value'\n};\n\nconst updated = await sdk.users.update('123', updates);",
            "correspondsTo": "PATCH /v1/users/:id"
          },
          {
            "name": "delete",
            "signature": "delete(id: string): Promise<Users>",
            "description": "Delete a users",
            "example": "const deleted = await sdk.users.delete('123');\nconsole.log('Deleted:', deleted);",
            "correspondsTo": "DELETE /v1/users/:id"
          }
        ]
      },
      "api": {
        "endpoints": [
          {
            "method": "GET",
            "path": "/v1/users",
            "description": "List all users records with pagination metadata",
            "queryParameters": {
              "limit": "number - Max records to return (default: 50)",
              "offset": "number - Records to skip",
              "orderBy": "string | string[] - Field(s) to sort by",
              "order": "'asc' | 'desc' | ('asc' | 'desc')[] - Sort direction(s)",
              "id": "uuid - Filter by id",
              "email": "string - Filter by email",
              "email_like": "string - Search in email",
              "role": "user_role - Filter by role",
              "...": "Additional filters for all fields"
            },
            "responseBody": "PaginatedResponse<Users>"
          },
          {
            "method": "GET",
            "path": "/v1/users/:id",
            "description": "Get users by ID",
            "responseBody": "Users"
          },
          {
            "method": "POST",
            "path": "/v1/users",
            "description": "Create new users",
            "requestBody": "InsertUsers",
            "responseBody": "Users"
          },
          {
            "method": "PATCH",
            "path": "/v1/users/:id",
            "description": "Update users",
            "requestBody": "UpdateUsers",
            "responseBody": "Users"
          },
          {
            "method": "DELETE",
            "path": "/v1/users/:id",
            "description": "Delete users",
            "responseBody": "Users"
          }
        ]
      },
      "fields": [
        {
          "name": "id",
          "type": "uuid",
          "tsType": "string",
          "required": false,
          "description": "Primary key"
        },
        {
          "name": "email",
          "type": "string",
          "tsType": "string",
          "required": true,
          "description": "email"
        },
        {
          "name": "role",
          "type": "user_role",
          "tsType": "\"admin\" | \"moderator\" | \"user\" | \"guest\"",
          "required": false,
          "description": "role"
        },
        {
          "name": "backup_role",
          "type": "user_role",
          "tsType": "\"admin\" | \"moderator\" | \"user\" | \"guest\" | null",
          "required": false,
          "description": "backup role"
        }
      ]
    }
  ],
  "relationships": [
    {
      "from": "book_tags",
      "to": "books",
      "type": "many-to-one",
      "description": "Each book_tags belongs to one books"
    },
    {
      "from": "book_tags",
      "to": "tags",
      "type": "many-to-one",
      "description": "Each book_tags belongs to one tags"
    },
    {
      "from": "books",
      "to": "authors",
      "type": "many-to-one",
      "description": "Each books belongs to one authors"
    }
  ]
};

export const contractMarkdown = `# API & SDK Contract

Unified API and SDK contract - your one-stop reference for all operations

**Version:** 2.0.0
**Generated:** 11/20/2025, 5:28:26 PM

## SDK Setup

### Installation

\`\`\`bash
# The SDK is generated in the client/ directory
# Import it directly from your generated code
\`\`\`

### Initialization

**Basic initialization:**

\`\`\`typescript
import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});
\`\`\`

**With authentication:**

\`\`\`typescript
import { SDK } from './client';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: {
    apiKey: process.env.API_KEY
  }
});
\`\`\`

**With custom fetch (for Node.js < 18):**

\`\`\`typescript
import { SDK } from './client';
import fetch from 'node-fetch';

const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  fetch: fetch as any
});
\`\`\`

### Authentication

**No authentication required:**

\`\`\`typescript
const sdk = new SDK({
  baseUrl: 'http://localhost:3000'
});
\`\`\`

**Custom headers provider:**

\`\`\`typescript
const sdk = new SDK({
  baseUrl: 'https://api.example.com',
  auth: async () => ({
    'Authorization': 'Bearer ' + await getToken(),
    'X-Request-ID': generateRequestId()
  })
});
\`\`\`

## Filtering with WHERE Clauses

The SDK provides type-safe WHERE clause filtering with support for various operators.

### Basic Filtering

**Direct equality:**

\`\`\`typescript
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
\`\`\`

### Comparison Operators

Use comparison operators for numeric, date, and other comparable fields:

\`\`\`typescript
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
\`\`\`

### String Operators

Pattern matching for string fields:

\`\`\`typescript
// Case-sensitive LIKE
const johnsmiths = await sdk.users.list({
  where: { name: { $like: '%Smith%' } }
});

// Case-insensitive ILIKE
const gmailUsers = await sdk.users.list({
  where: { email: { $ilike: '%@gmail.com' } }
});
\`\`\`

### Array Operators

Filter by multiple possible values:

\`\`\`typescript
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
\`\`\`

### NULL Checks

Check for null or non-null values:

\`\`\`typescript
// IS NULL
const activeRecords = await sdk.records.list({
  where: { deleted_at: { $is: null } }
});

// IS NOT NULL
const deletedRecords = await sdk.records.list({
  where: { deleted_at: { $isNot: null } }
});
\`\`\`

### Combining Operators

Mix multiple operators for complex queries:

\`\`\`typescript
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
\`\`\`

### Available Operators

| Operator | Description | Example | Types |
|----------|-------------|---------|-------|
| \`$eq\` | Equal to | \`{ age: { $eq: 25 } }\` | All |
| \`$ne\` | Not equal to | \`{ status: { $ne: 'inactive' } }\` | All |
| \`$gt\` | Greater than | \`{ price: { $gt: 100 } }\` | Number, Date |
| \`$gte\` | Greater than or equal | \`{ age: { $gte: 18 } }\` | Number, Date |
| \`$lt\` | Less than | \`{ quantity: { $lt: 10 } }\` | Number, Date |
| \`$lte\` | Less than or equal | \`{ age: { $lte: 65 } }\` | Number, Date |
| \`$in\` | In array | \`{ id: { $in: ['a', 'b'] } }\` | All |
| \`$nin\` | Not in array | \`{ role: { $nin: ['admin'] } }\` | All |
| \`$like\` | Pattern match (case-sensitive) | \`{ name: { $like: '%John%' } }\` | String |
| \`$ilike\` | Pattern match (case-insensitive) | \`{ email: { $ilike: '%@GMAIL%' } }\` | String |
| \`$is\` | IS NULL | \`{ deleted_at: { $is: null } }\` | Nullable fields |
| \`$isNot\` | IS NOT NULL | \`{ created_by: { $isNot: null } }\` | Nullable fields |

### Logical Operators

Combine conditions using \`$or\` and \`$and\` (supports 2 levels of nesting):

| Operator | Description | Example |
|----------|-------------|---------|
| \`$or\` | Match any condition | \`{ $or: [{ status: 'active' }, { role: 'admin' }] }\` |
| \`$and\` | Match all conditions (explicit) | \`{ $and: [{ age: { $gte: 18 } }, { status: 'verified' }] }\` |

\`\`\`typescript
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
\`\`\`

**Note:** The WHERE clause types are fully type-safe. TypeScript will only allow operators that are valid for each field type.

## Sorting

Sort query results using the \`orderBy\` and \`order\` parameters. Supports both single and multi-column sorting.

### Single Column Sorting

\`\`\`typescript
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
\`\`\`

### Multi-Column Sorting

\`\`\`typescript
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
\`\`\`

### Combining Sorting with Filters

\`\`\`typescript
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
\`\`\`

**Note:** Column names are validated by Zod schemas. Only valid table columns are accepted, preventing SQL injection.

## Resources

### Authors

Resource for authors operations

#### SDK Methods

Access via: \`sdk.authors\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<Authors>>\`
- List authors with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/authors\`

\`\`\`typescript
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
\`\`\`

**getByPk**
- Signature: \`getByPk(id: string): Promise<Authors | null>\`
- Get a single authors by primary key
- API: \`GET /v1/authors/:id\`

\`\`\`typescript
// Get by ID
const item = await sdk.authors.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
\`\`\`

**create**
- Signature: \`create(data: InsertAuthors): Promise<Authors>\`
- Create a new authors
- API: \`POST /v1/authors\`

\`\`\`typescript
import type { InsertAuthors } from './client/types/authors';

const newItem: InsertAuthors = {
    name: 'John Doe'
};

const created = await sdk.authors.create(newItem);
console.log('Created:', created.id);
\`\`\`

**update**
- Signature: \`update(id: string, data: UpdateAuthors): Promise<Authors>\`
- Update an existing authors
- API: \`PATCH /v1/authors/:id\`

\`\`\`typescript
import type { UpdateAuthors } from './client/types/authors';

const updates: UpdateAuthors = {
    name: 'John Doe'
};

const updated = await sdk.authors.update('123', updates);
\`\`\`

**delete**
- Signature: \`delete(id: string): Promise<Authors>\`
- Delete a authors
- API: \`DELETE /v1/authors/:id\`

\`\`\`typescript
const deleted = await sdk.authors.delete('123');
console.log('Deleted:', deleted);
\`\`\`

**listWithBooks**
- Signature: \`listWithBooks(params?: ListParams): PaginatedResponse<SelectAuthors & { books: SelectBooks[] }>\`
- Get authors with included books data
- API: \`POST /v1/authors/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithBooks**
- Signature: \`getByPkWithBooks(id: string): SelectAuthors & { books: SelectBooks[] } | null\`
- Get authors with included books data
- API: \`POST /v1/authors/list\`

\`\`\`typescript
const result = await sdk.authors.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

**listWithBooksAndTags**
- Signature: \`listWithBooksAndTags(params?: ListParams): PaginatedResponse<SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] }>\`
- Get authors with included books, tags data
- API: \`POST /v1/authors/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithBooksAndTags**
- Signature: \`getByPkWithBooksAndTags(id: string): SelectAuthors & { books: (SelectBooks & { tags: SelectTags[] })[] } | null\`
- Get authors with included books, tags data
- API: \`POST /v1/authors/list\`

\`\`\`typescript
const result = await sdk.authors.getByPkWithBooksAndTags('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

#### API Endpoints

- \`GET /v1/authors\`
  - List all authors records with pagination metadata
  - Response: \`PaginatedResponse<Authors>\`
- \`GET /v1/authors/:id\`
  - Get authors by ID
  - Response: \`Authors\`
- \`POST /v1/authors\`
  - Create new authors
  - Request: \`InsertAuthors\`
  - Response: \`Authors\`
- \`PATCH /v1/authors/:id\`
  - Update authors
  - Request: \`UpdateAuthors\`
  - Response: \`Authors\`
- \`DELETE /v1/authors/:id\`
  - Delete authors
  - Response: \`Authors\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | \`string\` |  | Primary key |
| name | string | \`string\` | ✓ | name |

### BookTags

Resource for book_tags operations

#### SDK Methods

Access via: \`sdk.book_tags\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<BookTags>>\`
- List book_tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/book_tags\`

\`\`\`typescript
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
\`\`\`

**create**
- Signature: \`create(data: InsertBookTags): Promise<BookTags>\`
- Create a new book_tags
- API: \`POST /v1/book_tags\`

\`\`\`typescript
import type { InsertBookTags } from './client/types/book_tags';

const newItem: InsertBookTags = {
    book_id: 'related-id-123',
  tag_id: 'related-id-123'
};

const created = await sdk.book_tags.create(newItem);
console.log('Created:', created.id);
\`\`\`

#### API Endpoints

- \`GET /v1/book_tags\`
  - List all book_tags records with pagination metadata
  - Response: \`PaginatedResponse<BookTags>\`
- \`POST /v1/book_tags\`
  - Create new book_tags
  - Request: \`InsertBookTags\`
  - Response: \`BookTags\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| book_id | uuid | \`string\` | ✓ | Foreign key to book → books |
| tag_id | uuid | \`string\` | ✓ | Foreign key to tag → tags |

### Books

Resource for books operations

#### SDK Methods

Access via: \`sdk.books\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<Books>>\`
- List books with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/books\`

\`\`\`typescript
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
\`\`\`

**getByPk**
- Signature: \`getByPk(id: string): Promise<Books | null>\`
- Get a single books by primary key
- API: \`GET /v1/books/:id\`

\`\`\`typescript
// Get by ID
const item = await sdk.books.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
\`\`\`

**create**
- Signature: \`create(data: InsertBooks): Promise<Books>\`
- Create a new books
- API: \`POST /v1/books\`

\`\`\`typescript
import type { InsertBooks } from './client/types/books';

const newItem: InsertBooks = {
    author_id: 'related-id-123',
  title: 'Example Title'
};

const created = await sdk.books.create(newItem);
console.log('Created:', created.id);
\`\`\`

**update**
- Signature: \`update(id: string, data: UpdateBooks): Promise<Books>\`
- Update an existing books
- API: \`PATCH /v1/books/:id\`

\`\`\`typescript
import type { UpdateBooks } from './client/types/books';

const updates: UpdateBooks = {
    author_id: 'related-id-123',
  title: 'Example Title'
};

const updated = await sdk.books.update('123', updates);
\`\`\`

**delete**
- Signature: \`delete(id: string): Promise<Books>\`
- Delete a books
- API: \`DELETE /v1/books/:id\`

\`\`\`typescript
const deleted = await sdk.books.delete('123');
console.log('Deleted:', deleted);
\`\`\`

**listWithAuthor**
- Signature: \`listWithAuthor(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors }>\`
- Get books with included author data
- API: \`POST /v1/books/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithAuthor**
- Signature: \`getByPkWithAuthor(id: string): SelectBooks & { author: SelectAuthors } | null\`
- Get books with included author data
- API: \`POST /v1/books/list\`

\`\`\`typescript
const result = await sdk.books.getByPkWithAuthor('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

**listWithTags**
- Signature: \`listWithTags(params?: ListParams): PaginatedResponse<SelectBooks & { tags: SelectTags[] }>\`
- Get books with included tags data
- API: \`POST /v1/books/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithTags**
- Signature: \`getByPkWithTags(id: string): SelectBooks & { tags: SelectTags[] } | null\`
- Get books with included tags data
- API: \`POST /v1/books/list\`

\`\`\`typescript
const result = await sdk.books.getByPkWithTags('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

**listWithAuthorAndTags**
- Signature: \`listWithAuthorAndTags(params?: ListParams): PaginatedResponse<SelectBooks & { author: SelectAuthors; tags: SelectTags[] }>\`
- Get books with included author, tags data
- API: \`POST /v1/books/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithAuthorAndTags**
- Signature: \`getByPkWithAuthorAndTags(id: string): (SelectBooks & { author: SelectAuthors; tags: SelectTags[] }) | null\`
- Get books with included author, tags data
- API: \`POST /v1/books/list\`

\`\`\`typescript
const result = await sdk.books.getByPkWithAuthorAndTags('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

#### API Endpoints

- \`GET /v1/books\`
  - List all books records with pagination metadata
  - Response: \`PaginatedResponse<Books>\`
- \`GET /v1/books/:id\`
  - Get books by ID
  - Response: \`Books\`
- \`POST /v1/books\`
  - Create new books
  - Request: \`InsertBooks\`
  - Response: \`Books\`
- \`PATCH /v1/books/:id\`
  - Update books
  - Request: \`UpdateBooks\`
  - Response: \`Books\`
- \`DELETE /v1/books/:id\`
  - Delete books
  - Response: \`Books\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | \`string\` |  | Primary key |
| author_id | uuid | \`string | null\` |  | Foreign key to author → authors |
| title | string | \`string\` | ✓ | title |

### Products

Resource for products operations

#### SDK Methods

Access via: \`sdk.products\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<Products>>\`
- List products with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/products\`

\`\`\`typescript
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
\`\`\`

**getByPk**
- Signature: \`getByPk(id: string): Promise<Products | null>\`
- Get a single products by primary key
- API: \`GET /v1/products/:id\`

\`\`\`typescript
// Get by ID
const item = await sdk.products.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
\`\`\`

**create**
- Signature: \`create(data: InsertProducts): Promise<Products>\`
- Create a new products
- API: \`POST /v1/products\`

\`\`\`typescript
import type { InsertProducts } from './client/types/products';

const newItem: InsertProducts = {
    name: 'John Doe',
  status: 'active',
  priority: 'example value'
};

const created = await sdk.products.create(newItem);
console.log('Created:', created.id);
\`\`\`

**update**
- Signature: \`update(id: string, data: UpdateProducts): Promise<Products>\`
- Update an existing products
- API: \`PATCH /v1/products/:id\`

\`\`\`typescript
import type { UpdateProducts } from './client/types/products';

const updates: UpdateProducts = {
    name: 'John Doe',
  status: 'active'
};

const updated = await sdk.products.update('123', updates);
\`\`\`

**delete**
- Signature: \`delete(id: string): Promise<Products>\`
- Delete a products
- API: \`DELETE /v1/products/:id\`

\`\`\`typescript
const deleted = await sdk.products.delete('123');
console.log('Deleted:', deleted);
\`\`\`

#### API Endpoints

- \`GET /v1/products\`
  - List all products records with pagination metadata
  - Response: \`PaginatedResponse<Products>\`
- \`GET /v1/products/:id\`
  - Get products by ID
  - Response: \`Products\`
- \`POST /v1/products\`
  - Create new products
  - Request: \`InsertProducts\`
  - Response: \`Products\`
- \`PATCH /v1/products/:id\`
  - Update products
  - Request: \`UpdateProducts\`
  - Response: \`Products\`
- \`DELETE /v1/products/:id\`
  - Delete products
  - Response: \`Products\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | \`string\` |  | Primary key |
| name | string | \`string\` | ✓ | name |
| status | product_status | \`"draft" | "published" | "archived"\` |  | status |
| priority | priority_level | \`"low" | "medium" | "high" | "critical"\` | ✓ | priority |
| tags | user_role[] | \`("admin" | "moderator" | "user" | "guest")[] | null\` |  | tags |

### Tags

Resource for tags operations

#### SDK Methods

Access via: \`sdk.tags\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<Tags>>\`
- List tags with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/tags\`

\`\`\`typescript
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
\`\`\`

**getByPk**
- Signature: \`getByPk(id: string): Promise<Tags | null>\`
- Get a single tags by primary key
- API: \`GET /v1/tags/:id\`

\`\`\`typescript
// Get by ID
const item = await sdk.tags.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
\`\`\`

**create**
- Signature: \`create(data: InsertTags): Promise<Tags>\`
- Create a new tags
- API: \`POST /v1/tags\`

\`\`\`typescript
import type { InsertTags } from './client/types/tags';

const newItem: InsertTags = {
    name: 'John Doe'
};

const created = await sdk.tags.create(newItem);
console.log('Created:', created.id);
\`\`\`

**update**
- Signature: \`update(id: string, data: UpdateTags): Promise<Tags>\`
- Update an existing tags
- API: \`PATCH /v1/tags/:id\`

\`\`\`typescript
import type { UpdateTags } from './client/types/tags';

const updates: UpdateTags = {
    name: 'John Doe'
};

const updated = await sdk.tags.update('123', updates);
\`\`\`

**delete**
- Signature: \`delete(id: string): Promise<Tags>\`
- Delete a tags
- API: \`DELETE /v1/tags/:id\`

\`\`\`typescript
const deleted = await sdk.tags.delete('123');
console.log('Deleted:', deleted);
\`\`\`

**listWithBooks**
- Signature: \`listWithBooks(params?: ListParams): PaginatedResponse<SelectTags & { books: SelectBooks[] }>\`
- Get tags with included books data
- API: \`POST /v1/tags/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithBooks**
- Signature: \`getByPkWithBooks(id: string): SelectTags & { books: SelectBooks[] } | null\`
- Get tags with included books data
- API: \`POST /v1/tags/list\`

\`\`\`typescript
const result = await sdk.tags.getByPkWithBooks('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

**listWithBooksAndAuthor**
- Signature: \`listWithBooksAndAuthor(params?: ListParams): PaginatedResponse<SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] }>\`
- Get tags with included books, author data
- API: \`POST /v1/tags/list\`

\`\`\`typescript
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
\`\`\`

**getByPkWithBooksAndAuthor**
- Signature: \`getByPkWithBooksAndAuthor(id: string): SelectTags & { books: (SelectBooks & { author: SelectAuthors })[] } | null\`
- Get tags with included books, author data
- API: \`POST /v1/tags/list\`

\`\`\`typescript
const result = await sdk.tags.getByPkWithBooksAndAuthor('123e4567-e89b-12d3-a456-426614174000');
\`\`\`

#### API Endpoints

- \`GET /v1/tags\`
  - List all tags records with pagination metadata
  - Response: \`PaginatedResponse<Tags>\`
- \`GET /v1/tags/:id\`
  - Get tags by ID
  - Response: \`Tags\`
- \`POST /v1/tags\`
  - Create new tags
  - Request: \`InsertTags\`
  - Response: \`Tags\`
- \`PATCH /v1/tags/:id\`
  - Update tags
  - Request: \`UpdateTags\`
  - Response: \`Tags\`
- \`DELETE /v1/tags/:id\`
  - Delete tags
  - Response: \`Tags\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | \`string\` |  | Primary key |
| name | string | \`string\` | ✓ | name |

### Users

Resource for users operations

#### SDK Methods

Access via: \`sdk.users\`

**list**
- Signature: \`list(params?: ListParams): Promise<PaginatedResponse<Users>>\`
- List users with filtering, sorting, and pagination. Returns paginated results with metadata.
- API: \`GET /v1/users\`

\`\`\`typescript
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
\`\`\`

**getByPk**
- Signature: \`getByPk(id: string): Promise<Users | null>\`
- Get a single users by primary key
- API: \`GET /v1/users/:id\`

\`\`\`typescript
// Get by ID
const item = await sdk.users.getByPk('123e4567-e89b-12d3-a456-426614174000');

// Check if exists
if (item === null) {
  console.log('Not found');
}
\`\`\`

**create**
- Signature: \`create(data: InsertUsers): Promise<Users>\`
- Create a new users
- API: \`POST /v1/users\`

\`\`\`typescript
import type { InsertUsers } from './client/types/users';

const newItem: InsertUsers = {
    email: 'user@example.com',
  role: 'example value',
  backup_role: 'example value'
};

const created = await sdk.users.create(newItem);
console.log('Created:', created.id);
\`\`\`

**update**
- Signature: \`update(id: string, data: UpdateUsers): Promise<Users>\`
- Update an existing users
- API: \`PATCH /v1/users/:id\`

\`\`\`typescript
import type { UpdateUsers } from './client/types/users';

const updates: UpdateUsers = {
    email: 'user@example.com',
  role: 'example value'
};

const updated = await sdk.users.update('123', updates);
\`\`\`

**delete**
- Signature: \`delete(id: string): Promise<Users>\`
- Delete a users
- API: \`DELETE /v1/users/:id\`

\`\`\`typescript
const deleted = await sdk.users.delete('123');
console.log('Deleted:', deleted);
\`\`\`

#### API Endpoints

- \`GET /v1/users\`
  - List all users records with pagination metadata
  - Response: \`PaginatedResponse<Users>\`
- \`GET /v1/users/:id\`
  - Get users by ID
  - Response: \`Users\`
- \`POST /v1/users\`
  - Create new users
  - Request: \`InsertUsers\`
  - Response: \`Users\`
- \`PATCH /v1/users/:id\`
  - Update users
  - Request: \`UpdateUsers\`
  - Response: \`Users\`
- \`DELETE /v1/users/:id\`
  - Delete users
  - Response: \`Users\`

#### Fields

| Field | Type | TypeScript | Required | Description |
|-------|------|------------|----------|-------------|
| id | uuid | \`string\` |  | Primary key |
| email | string | \`string\` | ✓ | email |
| role | user_role | \`"admin" | "moderator" | "user" | "guest"\` |  | role |
| backup_role | user_role | \`"admin" | "moderator" | "user" | "guest" | null\` |  | backup role |

## Relationships

- **book_tags** → **books** (many-to-one): Each book_tags belongs to one books
- **book_tags** → **tags** (many-to-one): Each book_tags belongs to one tags
- **books** → **authors** (many-to-one): Each books belongs to one authors

## Type Imports

\`\`\`typescript
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
\`\`\`
`;

/**
 * Get the contract in different formats
 */
export function getContract(format: 'json' | 'markdown' = 'json') {
  if (format === 'markdown') {
    return contractMarkdown;
  }
  return contract;
}

/**
 * Quick reference for all SDK clients
 */
export const sdkClients = [
  {
    "name": "authors",
    "client": "sdk.authors",
    "methods": [
      "list",
      "getByPk",
      "create",
      "update",
      "delete",
      "listWithBooks",
      "getByPkWithBooks",
      "listWithBooksAndTags",
      "getByPkWithBooksAndTags"
    ]
  },
  {
    "name": "book_tags",
    "client": "sdk.book_tags",
    "methods": [
      "list",
      "create"
    ]
  },
  {
    "name": "books",
    "client": "sdk.books",
    "methods": [
      "list",
      "getByPk",
      "create",
      "update",
      "delete",
      "listWithAuthor",
      "getByPkWithAuthor",
      "listWithTags",
      "getByPkWithTags",
      "listWithAuthorAndTags",
      "getByPkWithAuthorAndTags"
    ]
  },
  {
    "name": "products",
    "client": "sdk.products",
    "methods": [
      "list",
      "getByPk",
      "create",
      "update",
      "delete"
    ]
  },
  {
    "name": "tags",
    "client": "sdk.tags",
    "methods": [
      "list",
      "getByPk",
      "create",
      "update",
      "delete",
      "listWithBooks",
      "getByPkWithBooks",
      "listWithBooksAndAuthor",
      "getByPkWithBooksAndAuthor"
    ]
  },
  {
    "name": "users",
    "client": "sdk.users",
    "methods": [
      "list",
      "getByPk",
      "create",
      "update",
      "delete"
    ]
  }
];

/**
 * Type export reference
 */
export const typeImports = `
// Import the SDK
import { SDK } from './client';

// Import types for a specific resource
import type { SelectAuthors, InsertAuthors, UpdateAuthors } from './client/types/authors';

// Import all types
import type * as Types from './client/types';
`;
