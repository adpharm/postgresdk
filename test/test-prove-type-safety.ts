#!/usr/bin/env bun

/**
 * PROOF: This file will FAIL to compile if type safety is working
 *
 * Uncomment the code below and run: bunx tsc --noEmit test/test-prove-type-safety.ts
 * You'll see TypeScript errors proving the types are enforced.
 */

import { SDK } from "./.results/client";
import type { AuthorsIncludeSpec } from "./.results/client/include-spec";

const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// ✅ This compiles - valid include
const valid: AuthorsIncludeSpec = { books: true };
console.log("✅ Valid include:", valid);

// Uncomment these to see TypeScript errors:

/*
// ❌ This will NOT compile - invalid relation
const invalid1: AuthorsIncludeSpec = {
  nonExistentRelation: true  // ERROR: Property 'nonExistentRelation' does not exist
};
*/

/*
// ❌ This will NOT compile - invalid option
const invalid2: AuthorsIncludeSpec = {
  books: {
    invalidOption: 123  // ERROR: Property 'invalidOption' does not exist
  }
};
*/

/*
// ❌ This will NOT compile - wrong type
const invalid3: AuthorsIncludeSpec = {
  books: {
    limit: "5"  // ERROR: Type 'string' is not assignable to type 'number'
  }
};
*/

// ✅ But this DOES compile - all valid options
const validFull: AuthorsIncludeSpec = {
  books: {
    limit: 5,
    offset: 0,
    orderBy: "title",
    order: "asc",
    select: ["id", "title"],
    include: {
      tags: true
    }
  }
};
console.log("✅ Valid full include:", validFull);
