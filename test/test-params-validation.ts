#!/usr/bin/env bun
// Test that parameter Zod schemas work for CRUD endpoint validation

import { 
  AuthorsListParamsSchema, 
  AuthorsOrderParamsSchema,
  PaginationParamsSchema,
  BooksListParamsSchema
} from "./.results-with-tests/client";

console.log("Testing CRUD parameter validation schemas...\n");

// Test 1: Valid list parameters
console.log("1. Testing valid list parameters:");
const validListParams = {
  limit: 50,
  offset: 0,
  orderBy: "name",
  order: "asc",
  include: { books: true }
};
try {
  const parsed = AuthorsListParamsSchema.parse(validListParams);
  console.log("✅ Valid list params parsed:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 2: Invalid limit (too large)
console.log("\n2. Testing invalid limit (> 1000):");
const invalidLimit = { limit: 2000 };
try {
  AuthorsListParamsSchema.parse(invalidLimit);
  console.log("❌ Should have failed with large limit");
} catch (e: any) {
  console.log("✅ Correctly rejected large limit:", e.errors?.[0]?.message || e.message);
}

// Test 3: Invalid order direction
console.log("\n3. Testing invalid order direction:");
const invalidOrder = { order: "sideways" };
try {
  AuthorsListParamsSchema.parse(invalidOrder);
  console.log("❌ Should have failed with invalid order");
} catch (e: any) {
  console.log("✅ Correctly rejected invalid order:", e.errors?.[0]?.message || e.message);
}

// Test 4: Invalid column name for orderBy
console.log("\n4. Testing invalid orderBy column:");
const invalidOrderBy = { orderBy: "nonexistent_column" };
try {
  AuthorsListParamsSchema.parse(invalidOrderBy);
  console.log("❌ Should have failed with invalid column");
} catch (e: any) {
  console.log("✅ Correctly rejected invalid column:", e.errors?.[0]?.message || e.message);
}

// Test 5: Pagination schema reusability
console.log("\n5. Testing shared pagination schema:");
const paginationParams = { limit: 25, offset: 100 };
try {
  const parsed = PaginationParamsSchema.parse(paginationParams);
  console.log("✅ Pagination schema works:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 6: Order schema reusability
console.log("\n6. Testing order params schema:");
const orderParams = { orderBy: "id", order: "desc" };
try {
  const parsed = AuthorsOrderParamsSchema.parse(orderParams);
  console.log("✅ Order params schema works:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 7: Different table schema (books)
console.log("\n7. Testing books schema with different columns:");
const booksParams = { orderBy: "title", limit: 10 };
try {
  const parsed = BooksListParamsSchema.parse(booksParams);
  console.log("✅ Books schema works:", parsed);
} catch (e) {
  console.log("❌ Failed:", e);
}

// Test 8: Complex include structure
console.log("\n8. Testing complex include structure:");
const complexInclude = {
  include: {
    books: {
      limit: 5,
      offset: 0
    }
  },
  limit: 20
};
try {
  const parsed = AuthorsListParamsSchema.parse(complexInclude);
  console.log("✅ Complex include parsed:", JSON.stringify(parsed, null, 2));
} catch (e) {
  console.log("❌ Failed:", e);
}

console.log("\n✅ All parameter validation tests completed!");
console.log("\n🎯 Benefits for client apps:");
console.log("- Validate query params before sending API requests");
console.log("- Type-safe form building for search/filter UIs");
console.log("- Immediate feedback when API schemas change");
console.log("- Prevent invalid queries that would fail on server");