import { describe, test, expect, beforeAll } from "vitest";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { TEST_PATHS, PG_URL, CLI_PATH, ensurePostgresRunning } from "./test-utils";

const SERVER_DIR = TEST_PATHS.enums + "/server";
const CLIENT_DIR = TEST_PATHS.enums + "/client";
const CFG_PATH = join(process.cwd(), "gen-enums.config.ts");

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

describe("Enum Type Generation", () => {
  beforeAll(async () => {
    await ensurePostgresRunning();

    // Clean up
    if (existsSync(TEST_PATHS.enums)) {
      rmSync(TEST_PATHS.enums, { recursive: true, force: true });
    }
  });

  test("generate enum types and schemas", async () => {
    console.log("Writing config...");
    writeTestConfig();

    console.log("Applying enum schema...");
    await applySchemaWithPg(join(__dirname, "schema-enums.sql"));

    console.log("Running generator...");
    execSync(`bun ${CLI_PATH} generate -c ${CFG_PATH}`, { stdio: "inherit" });

    console.log("Verifying generated TypeScript types...");

    // Check users types
    const usersTypesPath = join(SERVER_DIR, "types", "users.ts");
    expect(existsSync(usersTypesPath)).toBe(true);
    const usersTypes = readFileSync(usersTypesPath, "utf-8");

    // Verify enum union types are generated
    expect(usersTypes.includes('"admin"')).toBe(true);
    expect(usersTypes.includes('"moderator"')).toBe(true);
    expect(usersTypes.includes('"user"')).toBe(true);
    expect(usersTypes.includes('"guest"')).toBe(true);

    expect(usersTypes.includes('role:')).toBe(true);
    expect(usersTypes.includes('backup_role?:')).toBe(true);
    expect(usersTypes.includes('| null')).toBe(true);

    // Check products types
    const productsTypesPath = join(SERVER_DIR, "types", "products.ts");
    expect(existsSync(productsTypesPath)).toBe(true);
    const productsTypes = readFileSync(productsTypesPath, "utf-8");

    expect(productsTypes.includes('"draft"')).toBe(true);
    expect(productsTypes.includes('"published"')).toBe(true);
    expect(productsTypes.includes('"archived"')).toBe(true);
    expect(productsTypes.includes('"low"')).toBe(true);
    expect(productsTypes.includes('"high"')).toBe(true);
    expect(productsTypes.includes('"critical"')).toBe(true);

    // Verify array of enums
    expect(productsTypes.includes('tags')).toBe(true);
    expect(productsTypes.includes('[]')).toBe(true);
  }, 60000);

  test("verify Zod schemas use z.enum()", async () => {
    // Check users zod schema
    const usersZodPath = join(SERVER_DIR, "zod", "users.ts");
    expect(existsSync(usersZodPath)).toBe(true);
    const usersZod = readFileSync(usersZodPath, "utf-8");

    // Verify z.enum() is used instead of z.string()
    expect(usersZod.includes('z.enum(')).toBe(true);
    expect(usersZod.includes('"admin"')).toBe(true);
    expect(usersZod.includes('role: z.enum([')).toBe(true);
    expect(usersZod.includes('backup_role: z.enum(')).toBe(true);
    expect(usersZod.includes('.nullable()')).toBe(true);

    // Check products zod schema
    const productsZodPath = join(SERVER_DIR, "zod", "products.ts");
    expect(existsSync(productsZodPath)).toBe(true);
    const productsZod = readFileSync(productsZodPath, "utf-8");

    expect(productsZod.includes('z.enum([')).toBe(true);
    expect(productsZod.includes('"draft"')).toBe(true);
    expect(productsZod.includes('"critical"')).toBe(true);

    // Verify array of enums uses z.array(z.enum())
    expect(productsZod.includes('z.array(')).toBe(true);
    expect(productsZod.includes('z.enum(')).toBe(true);
  });

  test("runtime validation with Zod", async () => {
    // Import the generated Zod schemas
    const { InsertUsersSchema } = await import(`../${SERVER_DIR}/zod/users.ts`);

    // Test valid enum value
    const validUser = { email: "admin@test.com", role: "admin" as const };
    const result1 = InsertUsersSchema.safeParse(validUser);
    expect(result1.success).toBe(true);

    // Test invalid enum value
    const invalidUser = { email: "bad@test.com", role: "superadmin" };
    const result2 = InsertUsersSchema.safeParse(invalidUser);
    expect(result2.success).toBe(false);

    // Test nullable enum with null
    const userWithNull = { email: "test@test.com", role: "user" as const, backup_role: null };
    const result3 = InsertUsersSchema.safeParse(userWithNull);
    expect(result3.success).toBe(true);

    // Test nullable enum with valid value
    const userWithBackup = { email: "test@test.com", role: "user" as const, backup_role: "admin" as const };
    const result4 = InsertUsersSchema.safeParse(userWithBackup);
    expect(result4.success).toBe(true);
  });
});
