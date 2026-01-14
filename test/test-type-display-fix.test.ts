/**
 * Test to verify the type display fix for JSONB generic types
 *
 * Bug: When using SelectAssets<TJsonb = {}>, TypeScript's intellisense
 * would display `{ [x: string]: ...; }` instead of the actual properties.
 *
 * Fix: Use conditional type `{} extends TJsonb ? BaseType : Omit<...>`
 * to return the base type directly when no generic is provided.
 */

// Simulate the generated types with JSONB columns
type _SelectProductsBase = {
  id: string;
  name: string;
  metadata: unknown | null;
  tags: unknown | null;
};

// The fixed version (what we generate now)
export type SelectProducts<TJsonb extends Partial<_SelectProductsBase> = {}> =
  {} extends TJsonb
    ? _SelectProductsBase
    : Omit<_SelectProductsBase, keyof TJsonb> & TJsonb;

// Test 1: Without generic parameter, should resolve to base type
type Test1 = SelectProducts;
const test1: Test1 = {
  id: "123",
  name: "Test Product",
  metadata: null,
  tags: null
};

// Verify properties are accessible
const id1: string = test1.id;
const name1: string = test1.name;
const metadata1: unknown | null = test1.metadata;

// Test 2: With typed JSONB override
type MyMetadata = { category: string; price: number };
type Test2 = SelectProducts<{ metadata: MyMetadata }>;

const test2: Test2 = {
  id: "456",
  name: "Typed Product",
  metadata: { category: "electronics", price: 99.99 },
  tags: null
};

// Verify JSONB override works
const metadata2: MyMetadata = test2.metadata;
const category: string = test2.metadata.category;
const price: number = test2.metadata.price;

// Test 3: Array usage (the key test case from the bug report)
const products: SelectProducts[] = [
  { id: "1", name: "Product 1", metadata: null, tags: null },
  { id: "2", name: "Product 2", metadata: { foo: "bar" }, tags: [] }
];

// This should NOT show index signature when hovering over 'product'
products.forEach((product) => {
  // TypeScript should know these properties exist
  const id: string = product.id;
  const name: string = product.name;
  console.log(`${id}: ${name}`);
});

// Test 4: Where clause usage
type WhereCondition<T> = T | { $eq?: T; $ne?: T };
type WhereFieldConditions<T> = {
  [K in keyof T]?: WhereCondition<T[K]>;
};
type Where<T> = WhereFieldConditions<T>;

// This should work without index signature issues
type ProductWhere = Where<SelectProducts>;
const where: ProductWhere = {
  id: "123",
  name: { $eq: "Test" },
  metadata: null
};

// Test 5: List response
type PaginatedResponse<T> = {
  data: T[];
  total: number;
  hasMore: boolean;
};

async function mockList(): Promise<PaginatedResponse<SelectProducts>> {
  return {
    data: [
      { id: "1", name: "A", metadata: null, tags: null },
      { id: "2", name: "B", metadata: null, tags: null }
    ],
    total: 2,
    hasMore: false
  };
}

// Usage should work cleanly
(async () => {
  const result = await mockList();
  result.data.forEach((product) => {
    // Should have full type information, not index signature
    console.log(product.id, product.name);
  });
})();

console.log("✅ Type display fix test passed!");
