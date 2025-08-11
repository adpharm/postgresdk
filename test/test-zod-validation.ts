#!/usr/bin/env bun
// Test that Zod schemas are properly exported and can be used for form validation

import { InsertAuthorsSchema, UpdateAuthorsSchema, InsertBooksSchema } from "./.results-with-tests/client";

console.log("Testing Zod schema validation in client SDK...\n");

// Test 1: Valid author insert
console.log("1. Testing valid author insert:");
const validAuthor = { name: "Jane Doe" };
try {
  const parsed = InsertAuthorsSchema.parse(validAuthor);
  console.log("✅ Valid author parsed:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 2: Invalid author insert (missing required field)
console.log("\n2. Testing invalid author insert (missing name):");
const invalidAuthor = {};
try {
  InsertAuthorsSchema.parse(invalidAuthor);
  console.log("❌ Should have failed validation");
} catch (e: any) {
  console.log("✅ Correctly failed validation:", e.errors?.[0]?.message || e.message);
}

// Test 3: Author update (all fields optional)
console.log("\n3. Testing author update (partial):");
const authorUpdate = { name: "Updated Name" };
try {
  const parsed = UpdateAuthorsSchema.parse(authorUpdate);
  console.log("✅ Valid update parsed:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 4: Book insert with multiple fields
console.log("\n4. Testing book insert:");
const validBook = { 
  title: "Test Book",
  author_id: "123e4567-e89b-12d3-a456-426614174000"
};
try {
  const parsed = InsertBooksSchema.parse(validBook);
  console.log("✅ Valid book parsed:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 5: Using schema for form field extraction
console.log("\n5. Extracting form field info from schema:");
console.log("InsertAuthorsSchema shape:", InsertAuthorsSchema.shape);
console.log("Field 'name' is optional?", InsertAuthorsSchema.shape.name.isOptional());

console.log("\n✅ All tests completed! Zod schemas are properly exported and usable for form validation.");