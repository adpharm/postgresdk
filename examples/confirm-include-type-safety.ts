#!/usr/bin/env bun

/**
 * Demonstration: Type-Safe Include Parameters
 *
 * This example shows that the SDK's include parameter is now fully typed
 * with AuthorsIncludeSpec, providing autocomplete and compile-time validation.
 *
 * Before: include?: any (no type safety)
 * After: include?: AuthorsIncludeSpec (full type safety)
 */

import { SDK } from "../test/.results/client";
import type { AuthorsIncludeSpec } from "../test/.results/client/include-spec";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// ✅ Example 1: Simple boolean include - VALID
const example1: AuthorsIncludeSpec = {
  books: true
};

// ✅ Example 2: Include with options - VALID
const example2: AuthorsIncludeSpec = {
  books: {
    limit: 5,
    offset: 0,
    orderBy: "title",
    order: "asc",
    select: ["id", "title"],
    exclude: ["created_at"]
  }
};

// ✅ Example 3: Nested includes - VALID
const example3: AuthorsIncludeSpec = {
  books: {
    limit: 10,
    include: {
      tags: true  // BooksIncludeSpec is properly typed here
    }
  }
};

// ✅ Example 4: Deep nesting with options - VALID
const example4: AuthorsIncludeSpec = {
  books: {
    limit: 5,
    select: ["id", "title", "author_id"],
    include: {
      tags: {
        limit: 3,
        orderBy: "name",
        order: "desc"
      }
    }
  }
};

// ✅ Example 5: Empty include - VALID
const example5: AuthorsIncludeSpec = {};

// Demo: Using the typed include in SDK calls
async function demoTypedIncludes() {
  // TypeScript will provide autocomplete for valid relations
  const result1 = await sdk.authors.list({
    include: {
      books: true  // ✅ Autocomplete suggests "books"
    }
  });

  // TypeScript will provide autocomplete for valid options
  const result2 = await sdk.authors.list({
    include: {
      books: {
        limit: 5,        // ✅ Autocomplete shows: limit, offset, orderBy, order, select, exclude, include
        order: "asc",    // ✅ Autocomplete shows: "asc" | "desc"
        include: {
          tags: true     // ✅ Autocomplete shows valid nested relations
        }
      }
    }
  });

  // The following would cause TypeScript errors (if uncommented):

  /*
  // ❌ ERROR: nonExistentRelation is not a valid relation
  await sdk.authors.list({
    include: {
      nonExistentRelation: true
    }
  });
  */

  /*
  // ❌ ERROR: invalidOption is not a valid include option
  await sdk.authors.list({
    include: {
      books: {
        invalidOption: 123
      }
    }
  });
  */

  /*
  // ❌ ERROR: limit must be a number, not a string
  await sdk.authors.list({
    include: {
      books: {
        limit: "5"
      }
    }
  });
  */

  console.log("✅ All type-safe includes work correctly!");
}

// Show the examples
console.log("✅ Example 1 (simple boolean):", example1);
console.log("✅ Example 2 (with options):", example2);
console.log("✅ Example 3 (nested):", example3);
console.log("✅ Example 4 (deep nesting):", example4);
console.log("✅ Example 5 (empty):", example5);

console.log("\n📚 Type Safety Benefits:");
console.log("  • IDE autocomplete for relation names");
console.log("  • IDE autocomplete for include options");
console.log("  • Compile-time validation of relation names");
console.log("  • Compile-time validation of option types");
console.log("  • No more runtime errors from typos");
console.log("  • Better developer experience");

// Uncomment to run the demo with a real server:
// demoTypedIncludes();
