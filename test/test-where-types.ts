/**
 * Test file demonstrating WHERE clause type safety
 *
 * This file shows how the Where<T> types work with the SDK
 */

// Example type definitions (mimicking what would be generated)
type SelectUser = {
  id: string;
  name: string;
  email: string;
  age: number;
  created_at: string;
  deleted_at: string | null;
};

// Import the Where type (this would come from generated code)
type WhereOperator<T> = {
  $eq?: T;
  $ne?: T;
  $gt?: T;
  $gte?: T;
  $lt?: T;
  $lte?: T;
  $in?: T[];
  $nin?: T[];
  $like?: T extends string ? string : never;
  $ilike?: T extends string ? string : never;
  $is?: null;
  $isNot?: null;
};

type WhereCondition<T> = T | WhereOperator<T>;
type Where<T> = {
  [K in keyof T]?: WhereCondition<T[K]>;
};

// Example usage - these should all be valid
const validExamples: Where<SelectUser>[] = [
  // Direct equality
  { id: "123" },

  // Multiple fields
  { id: "123", name: "John" },

  // Operators
  { age: { $gt: 18 } },
  { age: { $gte: 18, $lt: 65 } },

  // String operators (only on string fields)
  { name: { $like: "%John%" } },
  { email: { $ilike: "%@example.com" } },

  // Array operators
  { id: { $in: ["1", "2", "3"] } },
  { name: { $nin: ["admin", "system"] } },

  // NULL checks
  { deleted_at: { $is: null } },
  { deleted_at: { $isNot: null } },

  // Mixed
  { age: { $gte: 18 }, name: { $like: "%Smith%" } },
];

// These should cause type errors (commented out to avoid compile errors):
/*
const invalidExamples = [
  // Wrong type for field
  { age: "not a number" },  // Error: string not assignable to number

  // $like on non-string field
  { age: { $like: "%" } },  // Error: $like only works on strings

  // Invalid field name
  { invalidField: "test" },  // Error: property doesn't exist
];
*/

console.log("✅ Where type definitions are working correctly");
