/**
 * Compile-Time Type Safety Verification
 *
 * This file contains intentionally invalid code with @ts-expect-error annotations.
 * These should fail TypeScript compilation without the annotations.
 *
 * Run: bun run test:typecheck
 * This file should compile successfully because all errors are expected.
 */

import { SDK } from "./.results/client";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// ❌ Test: Invalid relation name should fail
sdk.authors.list({
  include: {
    // @ts-expect-error - nonExistentRelation is not a valid relation
    nonExistentRelation: true
  }
});

// ❌ Test: Invalid options should fail
sdk.authors.list({
  include: {
    books: {
      // @ts-expect-error - invalidOption is not a valid include option
      invalidOption: 123
    }
  }
});

// ❌ Test: Invalid nested relation should fail
sdk.authors.list({
  include: {
    books: {
      include: {
        // @ts-expect-error - authors don't have a 'chapters' relation
        chapters: true
      }
    }
  }
});

// ❌ Test: Wrong type for limit should fail
sdk.authors.list({
  include: {
    books: {
      // @ts-expect-error - limit must be a number, not a string
      limit: "5"
    }
  }
});

// ❌ Test: Invalid order value should fail
sdk.authors.list({
  include: {
    books: {
      // @ts-expect-error - order must be "asc" or "desc"
      order: "ascending"
    }
  }
});

// ❌ Test: Invalid orderBy value type should fail
sdk.authors.list({
  include: {
    books: {
      // @ts-expect-error - orderBy must be a string, not a number
      orderBy: 123
    }
  }
});

// ✅ Test: Valid includes should NOT error
sdk.authors.list({
  include: {
    books: true
  }
});

sdk.authors.list({
  include: {
    books: {
      limit: 5,
      offset: 10,
      orderBy: "title",
      order: "asc",
      select: ["id", "title"],
      exclude: ["created_at"],
      include: {
        tags: true
      }
    }
  }
});

console.log("✅ Type safety verification complete");
