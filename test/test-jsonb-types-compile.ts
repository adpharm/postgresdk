/**
 * Compile-time type safety tests for JSONB generics
 *
 * This file is NOT executed - it's type-checked by TypeScript.
 * It verifies that:
 * 1. Generic types accept valid overrides
 * 2. TypeScript catches invalid field access
 * 3. Type constraints work correctly
 * 4. Non-JSONB tables remain simple types
 *
 * Run with: tsc --noEmit test/test-jsonb-types-compile.ts
 */

// Import generated types from test output
import type { SelectProducts, InsertProducts, UpdateProducts } from './test/.jsonb-types-test/client/types/products';
import type { SelectUsers } from './test/.jsonb-types-test/client/types/users';

// ============================================
// Test 1: Valid generic usage compiles
// ============================================

type Metadata = {
  category: string;
  specs: { cpu: string; ram: number };
  tags: string[];
};

type Settings = {
  theme: 'light' | 'dark';
  notifications: boolean;
};

// Should compile: Valid generic parameter
type TypedProduct = SelectProducts<{
  metadata: Metadata;
  settings: Settings;
}>;

const product: TypedProduct = {} as any;

// Should compile: Accessing typed JSONB fields
const category: string = product.metadata.category;
const cpu: string = product.metadata.specs.cpu;
const ram: number = product.metadata.specs.ram;
const tags: string[] = product.metadata.tags;
const theme: 'light' | 'dark' = product.settings.theme;

// ============================================
// Test 2: Invalid field access is caught
// ============================================

// @ts-expect-error - Should fail: accessing non-existent field
const invalid1 = product.metadata.nonexistent;

// @ts-expect-error - Should fail: accessing non-existent nested field
const invalid2 = product.metadata.specs.gpu;

// @ts-expect-error - Should fail: wrong type assignment
const wrongType: number = product.metadata.category;

// ============================================
// Test 3: Generic constraint enforcement
// ============================================

// @ts-expect-error - Should fail: trying to override non-existent column
type BadOverride1 = SelectProducts<{
  nonExistentColumn: string;
}>;

// @ts-expect-error - Should fail: trying to override non-JSONB column with object
type BadOverride2 = SelectProducts<{
  name: { invalid: string };
}>;

// ============================================
// Test 4: Insert/Update types work
// ============================================

type TypedInsert = InsertProducts<{
  metadata: Metadata;
}>;

const insertData: TypedInsert = {
  name: "Laptop",
  metadata: {
    category: "electronics",
    specs: { cpu: "i7", ram: 16 },
    tags: ["premium"]
  }
};

// Should compile: accessing typed insert field
const insertCategory: string = insertData.metadata.category;

// @ts-expect-error - Should fail: wrong type in insert
const badInsert: TypedInsert = {
  name: "Test",
  metadata: {
    category: 123,  // Should be string
    specs: { cpu: "i7", ram: 16 },
    tags: ["tag"]
  }
};

type TypedUpdate = UpdateProducts<{
  metadata: Metadata;
}>;

const updateData: TypedUpdate = {
  metadata: {
    category: "furniture",
    specs: { cpu: "i5", ram: 8 },
    tags: []
  }
};

// Should compile: accessing typed update field
const updateCategory: string | undefined = updateData.metadata?.category;

// ============================================
// Test 5: Partial overrides work
// ============================================

// Should compile: Only override metadata, not settings
type PartialOverride = SelectProducts<{
  metadata: Metadata;
}>;

const partial: PartialOverride = {} as any;

const partialMeta: Metadata = partial.metadata;
const partialSettings: unknown = partial.settings;  // Still unknown

// ============================================
// Test 6: Non-JSONB tables are simple types
// ============================================

const user: SelectUsers = {} as any;

// Should compile: Simple non-generic type
const userName: string = user.name;
const userEmail: string = user.email;

// @ts-expect-error - Should fail: SelectUsers is NOT generic
type BadUserGeneric = SelectUsers<{ name: string }>;

// ============================================
// Test 7: Nullable JSONB fields
// ============================================

type NullableSettings = SelectProducts<{
  settings: Settings | null;
}>;

const nullableProduct: NullableSettings = {} as any;

// Should compile: settings can be null
const maybeSettings: Settings | null = nullableProduct.settings;

if (nullableProduct.settings !== null) {
  // Should compile: narrowed type
  const theme: 'light' | 'dark' = nullableProduct.settings.theme;
}

// ============================================
// Test 8: Array types in JSONB
// ============================================

type ArrayMetadata = {
  tags: string[];
  scores: number[];
};

type ProductWithArrays = SelectProducts<{
  metadata: ArrayMetadata;
}>;

const arrayProduct: ProductWithArrays = {} as any;

// Should compile: array methods work
const firstTag: string | undefined = arrayProduct.metadata.tags[0];
const tagCount: number = arrayProduct.metadata.tags.length;
const upperTags: string[] = arrayProduct.metadata.tags.map(t => t.toUpperCase());

// @ts-expect-error - Should fail: wrong array type
const wrongArray: number[] = arrayProduct.metadata.tags;

// ============================================
// Test 9: Nested object types
// ============================================

type DeepMetadata = {
  user: {
    profile: {
      name: string;
      settings: {
        theme: 'light' | 'dark';
      };
    };
  };
};

type DeepProduct = SelectProducts<{
  metadata: DeepMetadata;
}>;

const deepProduct: DeepProduct = {} as any;

// Should compile: deep nesting works
const deepName: string = deepProduct.metadata.user.profile.name;
const deepTheme: 'light' | 'dark' = deepProduct.metadata.user.profile.settings.theme;

// @ts-expect-error - Should fail: accessing non-existent deep field
const invalid3 = deepProduct.metadata.user.profile.nonexistent;

// ============================================
// Test 10: Union types in JSONB
// ============================================

type UnionMetadata = {
  value: string | number;
  status: 'active' | 'inactive' | 'pending';
};

type UnionProduct = SelectProducts<{
  metadata: UnionMetadata;
}>;

const unionProduct: UnionProduct = {} as any;

// Should compile: union types work
const value: string | number = unionProduct.metadata.value;
const status: 'active' | 'inactive' | 'pending' = unionProduct.metadata.status;

// @ts-expect-error - Should fail: wrong union member
const badStatus: 'deleted' = unionProduct.metadata.status;

// ============================================
// SUCCESS: If this file type-checks, all tests pass!
// ============================================

export {};
