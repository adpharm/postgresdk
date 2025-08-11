#!/usr/bin/env bun
// Example: Using SDK Zod schemas for form validation in a client app

import { SDK, InsertBooksSchema, UpdateBooksSchema } from "./.results-with-tests/client";

// Simulated form data (e.g., from a React form)
const formData = {
  title: "The Great Gatsby",
  author_id: "123e4567-e89b-12d3-a456-426614174000",
  publication_year: "1925", // Coming from form as string
  isbn: "978-0-7432-7356-5"
};

console.log("📝 Form Validation Example\n");
console.log("Raw form data:", formData);

// 1. Validate form data before sending to API
console.log("\n1. Validating form data...");
const validation = InsertBooksSchema.safeParse(formData);

if (!validation.success) {
  console.log("❌ Validation failed:");
  validation.error.errors.forEach(err => {
    console.log(`  - Field '${err.path.join('.')}': ${err.message}`);
  });
  process.exit(1);
}

console.log("✅ Form data is valid!");

// 2. Use validated data with SDK
const sdk = new SDK({ baseUrl: "http://localhost:3000" });
console.log("\n2. Ready to send validated data to API:");
console.log("   await sdk.books.create(validatedData)");

// 3. Example of update validation
console.log("\n3. Update form validation example:");
const updateFormData = { title: "Updated Title" };
const updateValidation = UpdateBooksSchema.safeParse(updateFormData);

if (updateValidation.success) {
  console.log("✅ Update data is valid:", updateValidation.data);
}

// 4. Show how schemas detect breaking changes
console.log("\n4. Schema helps detect breaking changes:");
console.log("   - If a required field is added to the database");
console.log("   - Regenerating the SDK updates the Zod schema");
console.log("   - Form validation will fail if the new field is missing");
console.log("   - TypeScript will also show compile errors where forms are built");

console.log("\n✨ Benefits:");
console.log("- Form validation matches API requirements exactly");
console.log("- Type safety from form to API call");
console.log("- Schema changes immediately surface in client code");
console.log("- Single source of truth for validation rules");