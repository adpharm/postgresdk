import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { TEST_PATHS, PG_URL, CLI_PATH } from "./test-utils";

interface TestCase {
  name: string;
  config: string;
  serverDir: string;
  clientDir: string;
}

const testCases: TestCase[] = [
  {
    name: "Basic configuration",
    serverDir: `${TEST_PATHS.typecheck}/basic/server`,
    clientDir: `${TEST_PATHS.typecheck}/basic/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_PATHS.typecheck}/basic/server",
        client: "${TEST_PATHS.typecheck}/basic/client"
      }
    };`,
  },
  {
    name: "Same directory configuration",
    serverDir: `${TEST_PATHS.typecheck}/same-dir`,
    clientDir: `${TEST_PATHS.typecheck}/same-dir`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_PATHS.typecheck}/same-dir",
        client: "${TEST_PATHS.typecheck}/same-dir"
      }
    };`,
  },
  {
    name: "With API key auth",
    serverDir: `${TEST_PATHS.typecheck}/auth-apikey/server`,
    clientDir: `${TEST_PATHS.typecheck}/auth-apikey/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_PATHS.typecheck}/auth-apikey/server",
        client: "${TEST_PATHS.typecheck}/auth-apikey/client"
      },
      auth: {
        strategy: "api-key",
        apiKeyHeader: "x-api-key",
        apiKeys: ["test-key"]
      }
    };`,
  },
  {
    name: "With JWT auth",
    serverDir: `${TEST_PATHS.typecheck}/auth-jwt/server`,
    clientDir: `${TEST_PATHS.typecheck}/auth-jwt/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_PATHS.typecheck}/auth-jwt/server",
        client: "${TEST_PATHS.typecheck}/auth-jwt/client"
      },
      auth: {
        strategy: "jwt-hs256",
        jwt: {
          services: [
            { issuer: "test", secret: "test-secret" }
          ],
          audience: "test"
        }
      }
    };`,
  },
];

async function typeCheckDirectory(dir: string, name: string): Promise<boolean> {
  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM"],
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      types: ["node", "bun-types"]
    },
    include: ["./**/*.ts"],
    exclude: ["node_modules", "**/*.test.ts", "**/*.spec.ts"]
  };

  const tsconfigPath = join(dir, "tsconfig.json");
  writeFileSync(tsconfigPath, JSON.stringify(tsConfig, null, 2), "utf-8");

  try {
    execSync(`cd ${dir} && bunx tsc --noEmit`, {
      stdio: "pipe",
      encoding: "utf-8"
    });
    console.log(`    ✓ ${name} passes type check`);
    return true;
  } catch (error: any) {
    console.error(`    ❌ ${name} type check failed:`);
    const output = error.stdout || error.stderr || error.message;
    const lines = output.split('\n');
    const errors = lines.filter((line: string) => line.includes('error TS'));
    console.error(`       Found ${errors.length} type error(s)`);
    if (errors.length > 0) {
      console.error(`       First error: ${errors[0]}`);
    } else {
      console.error(`       Error output: ${output.substring(0, 300)}`);
    }
    return false;
  }
}

describe("TypeScript compilation of generated code", () => {
  beforeAll(async () => {
    if (existsSync(TEST_PATHS.typecheck)) {
      rmSync(TEST_PATHS.typecheck, { recursive: true, force: true });
    }
    mkdirSync(TEST_PATHS.typecheck, { recursive: true });
  });

  afterAll(() => {
    // Clean up if all passed
    if (existsSync(TEST_PATHS.typecheck)) {
      rmSync(TEST_PATHS.typecheck, { recursive: true, force: true });
    }
  });

  for (const testCase of testCases) {
    test(testCase.name, async () => {
      // Write config and generate
      const configName = `${testCase.name.toLowerCase().replace(/\s+/g, '-')}.config.ts`;
      const configPath = join(__dirname, ".test-output", "typecheck", configName);
      writeFileSync(configPath, testCase.config, "utf-8");

      console.log("  → Generating SDK...");
      execSync(`bun ${CLI_PATH} generate -c ${configPath}`, {
        stdio: "pipe",
        encoding: "utf-8"
      });

      // Type check server code
      console.log("  → Type checking server code...");
      const serverPassed = await typeCheckDirectory(testCase.serverDir, "Server code");
      expect(serverPassed).toBe(true);

      // Determine actual client directory (might be in sdk subdir)
      const actualClientDir = testCase.serverDir === testCase.clientDir
        ? join(testCase.clientDir, "sdk")
        : testCase.clientDir;

      // Type check client code
      console.log("  → Type checking client code...");
      const clientPassed = await typeCheckDirectory(actualClientDir, "Client code");
      expect(clientPassed).toBe(true);
    }, 60000);
  }
});
