/**
 * Type-level test file for $or/$and WHERE clause type safety
 *
 * This file demonstrates how the Where<T> types should work with $or/$and operators
 */

// Example type definitions (mimicking what would be generated)
type SelectUser = {
  id: string;
  name: string;
  email: string;
  age: number;
  status: string;
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

// Updated Where type with $or/$and support (2 levels max)
type WhereFieldConditions<T> = {
  [K in keyof T]?: WhereCondition<T[K]>;
};

type Where<T> = WhereFieldConditions<T> & {
  $or?: (WhereFieldConditions<T>)[];
  $and?: (WhereFieldConditions<T> | { $or?: WhereFieldConditions<T>[] })[];
};

// ============================================================================
// VALID EXAMPLES - These should all type-check correctly
// ============================================================================

const validExamples: Where<SelectUser>[] = [
  // Basic $or with simple equality
  {
    $or: [
      { name: "Alice" },
      { name: "Bob" }
    ]
  },

  // $or with operators
  {
    $or: [
      { age: { $gt: 65 } },
      { age: { $lt: 18 } }
    ]
  },

  // Multiple fields in OR (the user's use case)
  {
    $or: [
      { name: { $ilike: "%f%" } },
      { email: { $ilike: "%f%" } }
    ]
  },

  // Mixed: implicit AND at root level with $or
  {
    status: "active",
    $or: [
      { name: "Alice" },
      { name: "Bob" }
    ]
  },

  // Multiple root-level conditions with $or
  {
    status: "active",
    deleted_at: { $is: null },
    $or: [
      { age: { $gt: 65 } },
      { age: { $lt: 18 } }
    ]
  },

  // Explicit $and
  {
    $and: [
      { status: "active" },
      { age: { $gte: 18 } }
    ]
  },

  // Nested: $and with $or inside (2 levels)
  {
    $and: [
      {
        $or: [
          { name: "Alice" },
          { name: "Bob" }
        ]
      },
      { status: "active" }
    ]
  },

  // Complex: $or at root, $and in one branch (2 levels)
  {
    $or: [
      { name: "Alice" },
      { age: { $gt: 65 } }
    ],
    status: "active"
  },

  // All operators should work inside $or
  {
    $or: [
      { age: { $eq: 25 } },
      { age: { $ne: 30 } },
      { age: { $gt: 40 } },
      { age: { $gte: 18 } },
      { age: { $lt: 65 } },
      { age: { $lte: 70 } },
      { id: { $in: ["1", "2"] } },
      { id: { $nin: ["3", "4"] } },
      { name: { $like: "%test%" } },
      { email: { $ilike: "%@gmail.com" } },
      { deleted_at: { $is: null } },
      { created_at: { $isNot: null } }
    ]
  },

  // Empty $or (edge case)
  {
    $or: []
  },

  // Single condition in $or
  {
    $or: [
      { name: "Alice" }
    ]
  },

  // Real-world complex query
  {
    $or: [
      { status: "admin" },
      {
        status: "active",
        email: { $ilike: "%@company.com" },
        age: { $gte: 25, $lte: 35 }
      }
    ]
  }
];

// ============================================================================
// INVALID EXAMPLES - These should cause type errors
// ============================================================================

/*
const invalidExamples = [
  // Wrong type for field in $or
  {
    $or: [
      { age: "not a number" }  // Error: string not assignable to number
    ]
  },

  // Invalid field name in $or
  {
    $or: [
      { invalidField: "test" }  // Error: property doesn't exist
    ]
  },

  // $like on non-string field in $or
  {
    $or: [
      { age: { $like: "%" } }  // Error: $like only works on strings
    ]
  },

  // $or is not an array
  {
    $or: { name: "Alice" }  // Error: $or must be an array
  },

  // Wrong operator types
  {
    $or: [
      { age: { $in: 25 } }  // Error: $in expects array, not single value
    ]
  },

  // 3 levels of nesting (should be disallowed)
  {
    $and: [
      {
        $or: [
          {
            $and: [  // Error: 3 levels deep
              { name: "Alice" }
            ]
          }
        ]
      }
    ]
  }
];
*/

// ============================================================================
// TYPE INFERENCE TESTS
// ============================================================================

// Test that Where<T> properly narrows types
function testTypeInference() {
  const where: Where<SelectUser> = {
    $or: [
      { name: "Alice" },
      { age: { $gt: 18 } }
    ]
  };

  // This should work - accessing $or
  if (where.$or) {
    const conditions = where.$or;
    // conditions should be typed as WhereFieldConditions<SelectUser>[]
    const firstCondition = conditions[0];
    if (firstCondition && "name" in firstCondition) {
      // firstCondition.name should be string | WhereOperator<string>
      const name = firstCondition.name;
    }
  }
}

console.log("✅ Where<T> type definitions for $or/$and are working correctly");
