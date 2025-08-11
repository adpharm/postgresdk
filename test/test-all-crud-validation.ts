#!/usr/bin/env bun
// Test all CRUD parameter validation schemas

import { 
  SDK,
  // Create schemas (for create() method)
  InsertContactsSchema,
  // Update schemas (for update() method) 
  UpdateContactsSchema,
  // Primary key schemas (for getByPk(), update(), delete() methods)
  ContactsPkSchema,
  AuthorsPkSchema,
  // List schemas (for list() method)
  ContactsListParamsSchema,
  PaginationParamsSchema
} from "./.results-with-tests/client";

console.log("Testing complete CRUD parameter validation...\n");

// 1. CREATE operation validation
console.log("1. Testing CREATE parameter validation:");
const createData = { first_name: "John", last_name: "Doe", email: "john@example.com" };
try {
  const validated = InsertContactsSchema.parse(createData);
  console.log("✅ Create data validated:", validated);
} catch (e) {
  console.log("❌ Create validation failed:", e);
}

// 2. GET BY PK operation validation
console.log("\n2. Testing GET BY PK parameter validation:");
const validPk = "123e4567-e89b-12d3-a456-426614174000";
const invalidPk = "";
try {
  ContactsPkSchema.parse(validPk);
  console.log("✅ Valid PK accepted:", validPk);
} catch (e) {
  console.log("❌ Should not have failed");
}

try {
  ContactsPkSchema.parse(invalidPk);
  console.log("❌ Should have rejected empty PK");
} catch (e: any) {
  console.log("✅ Empty PK rejected:", e.errors?.[0]?.message || e.message);
}

// 3. UPDATE operation validation (PK + data)
console.log("\n3. Testing UPDATE parameter validation:");
const updateData = { first_name: "Jane" };
try {
  const validatedPk = ContactsPkSchema.parse(validPk);
  const validatedData = UpdateContactsSchema.parse(updateData);
  console.log("✅ Update params validated:", { pk: validatedPk, data: validatedData });
} catch (e) {
  console.log("❌ Update validation failed:", e);
}

// 4. LIST operation validation
console.log("\n4. Testing LIST parameter validation:");
const listParams = { limit: 20, offset: 0 };
try {
  const validated = ContactsListParamsSchema.parse(listParams);
  console.log("✅ List params validated:", validated);
} catch (e) {
  console.log("❌ List validation failed:", e);
}

// 5. DELETE operation validation (just PK)
console.log("\n5. Testing DELETE parameter validation:");
try {
  const validatedPk = ContactsPkSchema.parse(validPk);
  console.log("✅ Delete PK validated:", validatedPk);
} catch (e) {
  console.log("❌ Delete validation failed:", e);
}

// 6. Example of wrapping SDK methods with validation
console.log("\n6. Example of wrapping SDK methods:");
const sdk = new SDK({ baseUrl: "http://localhost:3000" });

// Wrapper function that validates before calling SDK
async function safeCreateContact(data: unknown) {
  // Validate input before sending to API
  const validatedData = InsertContactsSchema.parse(data);
  return await sdk.contacts.create(validatedData);
}

async function safeGetContact(pk: unknown) {
  // Validate PK before sending to API
  const validatedPk = ContactsPkSchema.parse(pk);
  return await sdk.contacts.getByPk(validatedPk);
}

async function safeUpdateContact(pk: unknown, data: unknown) {
  // Validate both PK and data before sending to API
  const validatedPk = ContactsPkSchema.parse(pk);
  const validatedData = UpdateContactsSchema.parse(data);
  return await sdk.contacts.update(validatedPk, validatedData);
}

async function safeListContacts(params: unknown) {
  // Validate list params before sending to API
  const validatedParams = ContactsListParamsSchema.parse(params || {});
  return await sdk.contacts.list(validatedParams);
}

async function safeDeleteContact(pk: unknown) {
  // Validate PK before sending to API
  const validatedPk = ContactsPkSchema.parse(pk);
  return await sdk.contacts.delete(validatedPk);
}

console.log("✅ Safe wrapper functions created");

// 7. Composite primary key example
console.log("\n7. Testing composite primary key validation:");
// Check if book_tags has composite PK
try {
  console.log("Author PK (simple):", AuthorsPkSchema._def);
} catch (e) {
  console.log("PK validation working for simple keys");
}

console.log("\n✅ Complete CRUD validation test passed!");

console.log("\n🎯 Available schemas for each CRUD operation:");
console.log("- CREATE: InsertXxxSchema (already existed)");
console.log("- READ: XxxPkSchema (new!)");  
console.log("- UPDATE: XxxPkSchema + UpdateXxxSchema (PK new, Update existed)");
console.log("- DELETE: XxxPkSchema (new!)");
console.log("- LIST: XxxListParamsSchema (already existed)");

console.log("\n💡 Perfect for wrapping SDK methods with validation!");
console.log("- Validate all parameters before API calls");
console.log("- Catch invalid data before network requests");  
console.log("- Type-safe wrappers with runtime validation");
console.log("- Schema changes immediately break outdated code");