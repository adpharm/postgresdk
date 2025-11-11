#!/usr/bin/env bun
// Example: Using SDK parameter schemas for search/filter form validation

import { 
  SDK,
  BooksListParamsSchema, 
  PaginationParamsSchema,
  BooksOrderParamsSchema
} from "../test/.results-with-tests/client";

console.log("📋 Search Form Validation Example\n");

// Simulated form data from a search/filter UI
const searchFormData = {
  // Search filters
  limit: 25,
  offset: 0,
  orderBy: "title",
  order: "asc",
  
  // Include related data
  include: {
    author: true,
    tags: { limit: 5 }
  },
  
  // Filter conditions
  where: {
    publication_year: { gte: 2000 },
    author_id: { in: ["author1", "author2"] }
  }
};

console.log("Form data from search UI:", JSON.stringify(searchFormData, null, 2));

// 1. Validate complete search parameters
console.log("\n1. Validating complete search form...");
const listValidation = BooksListParamsSchema.safeParse(searchFormData);

if (!listValidation.success) {
  console.log("❌ Search form validation failed:");
  listValidation.error.issues.forEach((err: any) => {
    console.log(`  - Field '${err.path.join('.')}': ${err.message}`);
  });
  process.exit(1);
}

console.log("✅ Search form is valid!");

// 2. Validate pagination separately (useful for paginated UIs)
console.log("\n2. Validating pagination controls...");
const paginationData = { limit: searchFormData.limit, offset: searchFormData.offset };
const paginationValidation = PaginationParamsSchema.safeParse(paginationData);

if (paginationValidation.success) {
  console.log("✅ Pagination is valid:", paginationValidation.data);
}

// 3. Validate ordering separately (useful for sortable columns)
console.log("\n3. Validating sort controls...");
const sortData = { orderBy: searchFormData.orderBy, order: searchFormData.order };
const sortValidation = BooksOrderParamsSchema.safeParse(sortData);

if (sortValidation.success) {
  console.log("✅ Sort order is valid:", sortValidation.data);
}

// 4. Example of catching invalid column name (schema change protection)
console.log("\n4. Testing schema change protection...");
const invalidSort = { orderBy: "old_column_name", order: "asc" };
const invalidSortValidation = BooksOrderParamsSchema.safeParse(invalidSort);

if (!invalidSortValidation.success) {
  console.log("✅ Protected against schema change - old column rejected");
}

// 5. Using validated data with SDK
const sdk = new SDK({ baseUrl: "http://localhost:3000" });
console.log("\n5. Ready to use validated data with SDK:");
console.log("   const results = await sdk.books.list(validatedParams);");

console.log("\n🔄 Example workflow:");
console.log("1. User fills out search form");
console.log("2. Validate form data with schema before submission");
console.log("3. Show specific validation errors to user");
console.log("4. Only send valid queries to API");
console.log("5. Schema changes immediately break forms that need updates");

console.log("\n✨ This solves your original problem:");
console.log("- Database schema changes → regenerate SDK → forms fail validation");
console.log("- TypeScript compile errors show exactly which forms need updating");
console.log("- Runtime validation prevents invalid API calls");
console.log("- Single source of truth for both API and form validation");