#!/usr/bin/env bun

/**
 * Example: Automatic Include Type Inference
 *
 * The SDK now automatically infers the return type based on your include parameter.
 * NO MANUAL CASTS NEEDED! 🎉
 */

import { SDK } from "../test/.results/client";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// ============================================================================
// BEFORE: Manual Cast Required ❌
// ============================================================================

async function oldWay() {
  const result = await sdk.authors.list({
    where: { id: "author-1" },
    limit: 1,
    include: {
      books: {
        include: {
          tags: true
        }
      }
    }
  });

  // ❌ Had to manually cast:
  // type AuthorWithRelations = SelectAuthors & {
  //   books: Array<SelectBooks & { tags: SelectTags[] }>;
  // };
  // const author = result.data[0] as AuthorWithRelations;

  // return author.books[0]?.tags; // Worked but required manual work
}

// ============================================================================
// AFTER: Automatic Inference ✅
// ============================================================================

async function newWay() {
  const result = await sdk.authors.list({
    where: { id: "author-1" },
    limit: 1,
    include: {
      books: {
        include: {
          tags: true
        }
      }
    }
  });

  // ✅ NO CAST NEEDED! TypeScript automatically knows the shape:
  const author = result.data[0];

  if (author) {
    // TypeScript knows author.books exists and is an array
    console.log(`Author: ${author.name}`);
    console.log(`Books: ${author.books?.length ?? 0}`);

    // TypeScript knows each book has tags
    author.books?.forEach(book => {
      console.log(`  - ${book.title}`);
      book.tags?.forEach(tag => {
        console.log(`    #${tag.name}`);
      });
    });
  }

  return author;
}

// ============================================================================
// More Examples
// ============================================================================

// Example 1: Simple include
async function example1() {
  const result = await sdk.authors.list({
    include: { books: true }
  });

  // ✅ TypeScript knows: result.data[0].books exists
  const firstAuthor = result.data[0];
  console.log(firstAuthor?.books?.length);
}

// Example 2: Multiple relations
async function example2() {
  const result = await sdk.books.list({
    include: {
      author: true,
      tags: true
    }
  });

  // ✅ TypeScript knows both author and tags exist
  const firstBook = result.data[0];
  console.log(firstBook?.author?.name);
  console.log(firstBook?.tags?.length);
}

// Example 3: Deep nesting (3 levels)
async function example3() {
  const result = await sdk.authors.list({
    include: {
      books: {
        limit: 5,
        include: {
          tags: {
            limit: 10
          }
        }
      }
    }
  });

  // ✅ All levels are properly typed
  const author = result.data[0];
  const book = author?.books?.[0];
  const tag = book?.tags?.[0];

  console.log(tag?.name); // TypeScript knows this is string | undefined
}

// Example 4: With query options
async function example4() {
  const result = await sdk.authors.list({
    where: { name: { $like: '%Smith%' } },
    orderBy: "name",
    order: "asc",
    limit: 10,
    include: {
      books: {
        orderBy: "title",
        limit: 5,
        include: {
          tags: true
        }
      }
    }
  });

  // ✅ Full type safety with complex queries
  return result.data;
}

// ============================================================================
// The Magic Explained
// ============================================================================

/*
  How it works:

  1. The list() method is now generic:
     async list<TInclude extends AuthorsIncludeSpec = {}>(params?: {
       include?: TInclude;
       ...
     }): Promise<PaginatedResponse<AuthorsWithIncludes<TInclude>>>

  2. TypeScript infers TInclude from your include argument:
     include: { books: true }
     → TInclude = { books: true }

  3. AuthorsWithIncludes<T> is a mapped type that transforms the include spec:
     AuthorsWithIncludes<{ books: true }>
     → SelectAuthors & { books: SelectBooks[] }

  4. For nested includes:
     AuthorsWithIncludes<{ books: { include: { tags: true } } }>
     → SelectAuthors & { books: Array<BooksWithIncludes<{ tags: true }>> }
     → SelectAuthors & { books: Array<SelectBooks & { tags: SelectTags[] }> }

  Result: Automatic type inference - no manual casts! 🎉
*/

// ============================================================================
// Benefits
// ============================================================================

/*
  ✅ No more manual type definitions
  ✅ No more type casts
  ✅ Autocomplete for included relations
  ✅ Type safety for nested includes
  ✅ Refactoring safety (if you change the include, types update automatically)
  ✅ Works with all query options (where, orderBy, limit, etc.)
  ✅ Zero runtime overhead (types are compile-time only)
*/

console.log("🎯 Automatic include inference is now available!");
console.log("   No more manual casts needed - just use .list() with includes!");
