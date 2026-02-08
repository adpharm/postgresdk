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
// @ts-expect-error - nonExistentRelation is not a valid relation
sdk.authors.list({
  include: {
    nonExistentRelation: true
  }
});

// ❌ Test: Invalid options should fail
// @ts-expect-error - invalidOption is not a valid include option
sdk.authors.list({
  include: {
    books: {
      invalidOption: 123
    }
  }
});

// ❌ Test: Invalid nested relation should fail
// @ts-expect-error - authors don't have a 'chapters' relation
sdk.authors.list({
  include: {
    books: {
      include: {
        chapters: true
      }
    }
  }
});

// ❌ Test: Wrong type for limit should fail
// @ts-expect-error - limit must be a number, not a string
sdk.authors.list({
  include: {
    books: {
      limit: "5"
    }
  }
});

// ❌ Test: Invalid order value should fail
// @ts-expect-error - order must be "asc" or "desc"
sdk.authors.list({
  include: {
    books: {
      order: "ascending"
    }
  }
});

// ❌ Test: Invalid orderBy value type should fail
// @ts-expect-error - orderBy must be a string, not a number
sdk.authors.list({
  include: {
    books: {
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
