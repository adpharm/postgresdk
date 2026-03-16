#!/usr/bin/env bun
/**
 * Tests that all generated code passes TypeScript type checking
 * 
 * This test:
 * 1. Generates SDKs with various configurations
 * 2. Runs TypeScript compiler to check for type errors
 * 3. Tests specific configurations (same dir, auth, etc.)
 */

import { existsSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const TEST_DIR = "test/.typecheck-test";
const PG_URL = "postgres://user:pass@localhost:5432/testdb";

interface TestCase {
  name: string;
  config: string;
  serverDir: string;
  clientDir: string;
}

const testCases: TestCase[] = [
  {
    name: "Basic configuration",
    serverDir: `${TEST_DIR}/basic/server`,
    clientDir: `${TEST_DIR}/basic/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_DIR}/basic/server",
        client: "${TEST_DIR}/basic/client"
      }
    };`,
  },
  {
    name: "Same directory configuration",
    serverDir: `${TEST_DIR}/same-dir`,
    clientDir: `${TEST_DIR}/same-dir`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_DIR}/same-dir",
        client: "${TEST_DIR}/same-dir"
      }
    };`,
  },
  {
    name: "With API key auth",
    serverDir: `${TEST_DIR}/auth-apikey/server`,
    clientDir: `${TEST_DIR}/auth-apikey/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_DIR}/auth-apikey/server",
        client: "${TEST_DIR}/auth-apikey/client"
      },
      auth: {
        apiKeyHeader: "x-api-key",
        apiKeys: ["test-key"]
      }
    };`,
  },
  {
    name: "With JWT auth",
    serverDir: `${TEST_DIR}/auth-jwt/server`,
    clientDir: `${TEST_DIR}/auth-jwt/client`,
    config: `export default {
      connectionString: "${PG_URL}",
      outDir: {
        server: "${TEST_DIR}/auth-jwt/server",
        client: "${TEST_DIR}/auth-jwt/client"
      },
      auth: {
        jwt: {
          services: [
            { issuer: "test", secret: "env:TEST_JWT_SECRET" }
          ],
          audience: "test"
        }
      }
    };`,
  },
];

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function typeCheckDirectory(dir: string, name: string): Promise<boolean> {
  // Create a simple tsconfig for type checking
  const tsConfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "bundler",
      lib: ["ES2022", "DOM"],
      strict: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      resolveJsonModule: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      verbatimModuleSyntax: true,
      types: ["node", "bun-types"]
    },
    include: [
      "./**/*.ts"
    ],
    exclude: [
      "node_modules",
      "**/*.test.ts",
      "**/*.spec.ts"
    ]
  };
  
  const tsconfigPath = join(dir, "tsconfig.json");
  writeFileSync(tsconfigPath, JSON.stringify(tsConfig, null, 2), "utf-8");
  
  try {
    // Run TypeScript compiler with the generated config
    execSync(`cd ${dir} && tsc --noEmit`, { 
      stdio: "pipe",
      encoding: "utf-8"
    });
    console.log(`    ✓ ${name} passes type check`);
    return true;
  } catch (error: any) {
    console.error(`    ❌ ${name} type check failed:`);
    // Extract and show only the first few errors for clarity
    const output = error.stdout || error.stderr || error.message;
    const lines = output.split('\n');
    const errors = lines.filter((line: string) => line.includes('error TS'));
    console.error(`       Found ${errors.length} type error(s)`);
    if (errors.length > 0) {
      console.error(`       First error: ${errors[0]}`);
    }
    return false;
  }
}

async function main() {
  console.log("🧪 Testing TypeScript compilation of generated code");
  console.log("=" + "=".repeat(49));

  try {
    // Cleanup before tests
    await cleanup();
    mkdirSync(TEST_DIR, { recursive: true });

    // Set environment variable for JWT test
    process.env.TEST_JWT_SECRET = "test-secret-for-typecheck";

    let allPassed = true;
    const results: { name: string; passed: boolean }[] = [];
    
    for (const testCase of testCases) {
      console.log(`\n📝 ${testCase.name}...`);
      
      // Write config and generate
      const configPath = join(TEST_DIR, `${testCase.name.toLowerCase().replace(/\s+/g, '-')}.config.ts`);
      writeFileSync(configPath, testCase.config, "utf-8");
      
      console.log("  → Generating SDK...");
      try {
        execSync(`bun ${process.cwd()}/src/cli.ts generate -c ${configPath}`, { 
          stdio: "pipe",
          encoding: "utf-8"
        });
      } catch (error: any) {
        console.error(`  ❌ Generation failed: ${error.message}`);
        results.push({ name: testCase.name, passed: false });
        allPassed = false;
        continue;
      }
      
      // Type check server code
      console.log("  → Type checking server code...");
      const serverPassed = await typeCheckDirectory(testCase.serverDir, "Server code");
      
      // Determine actual client directory (might be in sdk subdir)
      const actualClientDir = testCase.serverDir === testCase.clientDir
        ? join(testCase.clientDir, "sdk") 
        : testCase.clientDir;
      
      // Type check client code
      console.log("  → Type checking client code...");
      const clientPassed = await typeCheckDirectory(actualClientDir, "Client code");
      
      const testPassed = serverPassed && clientPassed;
      results.push({ name: testCase.name, passed: testPassed });
      if (!testPassed) {
        allPassed = false;
      }
    }
    
    // Final summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 Test Results:");
    for (const result of results) {
      console.log(`  ${result.passed ? '✅' : '❌'} ${result.name}`);
    }
    
    console.log("\n" + "=".repeat(50));
    if (allPassed) {
      console.log("✅ All type checks passed!");
    } else {
      console.log("❌ Some type checks failed");
      
      // Leave files for debugging
      console.log("\n📁 Generated files left for inspection in:");
      console.log(`   ${TEST_DIR}`);
      console.log("   You can manually inspect the TypeScript errors.");
      
      process.exit(1);
    }
    console.log("=".repeat(50));
    
    // Clean up if all passed
    if (allPassed) {
      await cleanup();
      console.log("\n🧹 Cleaned up test files");
    } else {
      console.log("\n📁 Generated files left for inspection in:");
      console.log(`   ${TEST_DIR}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Type check test failed:", error);
    process.exit(1);
  }
}

main().catch(console.error);