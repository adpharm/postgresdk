import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";

const PG_URL = "postgres://user:pass@localhost:5432/testdb";
const SERVER_DIR = "test/.results-enums/server";
const CLIENT_DIR = "test/.results-enums/client";
const CFG_PATH = join(process.cwd(), "gen-enums.config.ts");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function applySchemaWithPg(sqlPath: string) {
  const sql = readFileSync(sqlPath, "utf8");
  const pg = new Client({ connectionString: PG_URL });
  await pg.connect();
  try {
    await pg.query(sql);
  } finally {
    await pg.end();
  }
}

function writeTestConfig() {
  const cfg = `export default {
  connectionString: "${PG_URL}",
  schema: "public",
  outDir: {
    server: "${SERVER_DIR}",
    client: "${CLIENT_DIR}"
  },
  softDeleteColumn: null,
  includeMethodsDepth: 2
};`;
  writeFileSync(CFG_PATH, cfg, "utf-8");
}

async function main() {
  console.log("\n" + "=".repeat(50));
  console.log("🧪 Testing Enum Type Generation");
  console.log("=".repeat(50));

  // Clean up
  if (existsSync("test/.results-enums")) {
    rmSync("test/.results-enums", { recursive: true, force: true });
  }

  console.log("\n1) Writing config...");
  writeTestConfig();

  console.log("2) Applying enum schema...");
  await applySchemaWithPg("test/schema-enums.sql");

  console.log("3) Running generator...");
  execSync(`bun run src/cli.ts generate -c ${CFG_PATH}`, { stdio: "inherit" });

  console.log("\n4) Verifying generated TypeScript types...");

  // Check users types
  const usersTypesPath = join(SERVER_DIR, "types", "users.ts");
  assert(existsSync(usersTypesPath), "users.ts should exist");
  const usersTypes = readFileSync(usersTypesPath, "utf-8");

  console.log("\n📋 Users types content:");
  console.log(usersTypes);

  // Verify enum union types are generated (not just "string")
  assert(
    usersTypes.includes('"admin"') && usersTypes.includes('"moderator"') && usersTypes.includes('"user"') && usersTypes.includes('"guest"'),
    "Should generate union type for user_role enum: \"admin\" | \"moderator\" | \"user\" | \"guest\""
  );
  assert(
    usersTypes.includes('role:') && usersTypes.includes('"admin"'),
    "role field should use enum union type"
  );
  assert(
    usersTypes.includes('backup_role?:') && usersTypes.includes('| null'),
    "nullable enum should have | null"
  );
  console.log("  ✓ TypeScript enum union types generated correctly");

  // Check products types
  const productsTypesPath = join(SERVER_DIR, "types", "products.ts");
  assert(existsSync(productsTypesPath), "products.ts should exist");
  const productsTypes = readFileSync(productsTypesPath, "utf-8");

  console.log("\n📋 Products types content:");
  console.log(productsTypes);

  assert(
    productsTypes.includes('"draft"') && productsTypes.includes('"published"') && productsTypes.includes('"archived"'),
    "Should generate union type for product_status enum"
  );
  assert(
    productsTypes.includes('"low"') && productsTypes.includes('"medium"') && productsTypes.includes('"high"') && productsTypes.includes('"critical"'),
    "Should generate union type for priority_level enum"
  );

  // Verify array of enums
  assert(
    productsTypes.includes('tags') && productsTypes.includes('[]'),
    "Should generate array type for enum arrays"
  );
  console.log("  ✓ Multiple enum types generated correctly");
  console.log("  ✓ Array of enum types handled correctly");

  console.log("\n5) Verifying generated Zod schemas...");

  // Check users zod schema
  const usersZodPath = join(SERVER_DIR, "zod", "users.ts");
  assert(existsSync(usersZodPath), "users zod schema should exist");
  const usersZod = readFileSync(usersZodPath, "utf-8");

  console.log("\n📋 Users Zod schema content:");
  console.log(usersZod);

  // Verify z.enum() is used instead of z.string()
  assert(
    usersZod.includes('z.enum(') && usersZod.includes('"admin"'),
    "Should use z.enum() for user_role, not z.string()"
  );
  assert(
    usersZod.includes('role: z.enum(['),
    "role field should use z.enum()"
  );
  assert(
    usersZod.includes('backup_role: z.enum(') && usersZod.includes('.nullable()'),
    "nullable enum should use z.enum().nullable()"
  );
  console.log("  ✓ Zod enum schemas generated with z.enum()");

  // Check products zod schema
  const productsZodPath = join(SERVER_DIR, "zod", "products.ts");
  assert(existsSync(productsZodPath), "products zod schema should exist");
  const productsZod = readFileSync(productsZodPath, "utf-8");

  console.log("\n📋 Products Zod schema content:");
  console.log(productsZod);

  assert(
    productsZod.includes('z.enum([') && productsZod.includes('"draft"'),
    "Should use z.enum() for product_status"
  );
  assert(
    productsZod.includes('z.enum([') && productsZod.includes('"critical"'),
    "Should use z.enum() for priority_level"
  );

  // Verify array of enums uses z.array(z.enum())
  assert(
    productsZod.includes('z.array(') && productsZod.includes('z.enum('),
    "Should use z.array(z.enum()) for enum arrays"
  );
  console.log("  ✓ Multiple Zod enum schemas generated correctly");
  console.log("  ✓ Array of enums uses z.array(z.enum())");

  console.log("\n6) Testing runtime validation...");

  // Import the generated Zod schemas
  const { InsertUsersSchema, InsertProductsSchema } = await import(`../${SERVER_DIR}/zod/users.ts`);

  // Test valid enum value
  const validUser = { email: "admin@test.com", role: "admin" as const };
  const result1 = InsertUsersSchema.safeParse(validUser);
  assert(result1.success, "Valid enum value should pass validation");
  console.log("  ✓ Valid enum value passes Zod validation");

  // Test invalid enum value
  const invalidUser = { email: "bad@test.com", role: "superadmin" };
  const result2 = InsertUsersSchema.safeParse(invalidUser);
  assert(!result2.success, "Invalid enum value should fail validation");
  console.log("  ✓ Invalid enum value fails Zod validation");

  // Test nullable enum with null
  const userWithNull = { email: "test@test.com", role: "user" as const, backup_role: null };
  const result3 = InsertUsersSchema.safeParse(userWithNull);
  assert(result3.success, "Nullable enum should accept null");
  console.log("  ✓ Nullable enum accepts null value");

  // Test nullable enum with valid value
  const userWithBackup = { email: "test@test.com", role: "user" as const, backup_role: "admin" as const };
  const result4 = InsertUsersSchema.safeParse(userWithBackup);
  assert(result4.success, "Nullable enum should accept valid enum value");
  console.log("  ✓ Nullable enum accepts valid enum value");

  console.log("\n" + "=".repeat(50));
  console.log("✅ All enum tests passed!");
  console.log("=".repeat(50));
  console.log("\nVerified:");
  console.log("  • TypeScript enum union types (\"admin\" | \"user\" | ...)");
  console.log("  • Zod z.enum() schemas (not z.string())");
  console.log("  • Nullable enum handling");
  console.log("  • Array of enum types");
  console.log("  • Runtime validation with valid/invalid values");
}

main().catch((err) => {
  console.error("❌ Enum test failed", err);
  process.exit(1);
});
