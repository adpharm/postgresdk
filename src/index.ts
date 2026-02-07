// Load environment variables first, before any other imports
import "dotenv/config";

import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { introspect } from "./introspect";
import { buildGraph } from "./rel-classify";
import { emitIncludeSpec } from "./emit-include-spec";
import { emitIncludeBuilder } from "./emit-include-builder";
import { emitZod } from "./emit-zod";
import { emitParamsZod } from "./emit-params-zod";
import { emitSharedParamsZod } from "./emit-shared-params-zod";
import { emitSharedTypes } from "./emit-shared-types";
import { emitHonoRoutes } from "./emit-routes-hono";
import { emitClient, emitClientIndex } from "./emit-client";
import { emitBaseClient } from "./emit-base-client";
import { emitIncludeLoader } from "./emit-include-loader";
import { emitTypes } from "./emit-types";
import { emitLogger } from "./emit-logger";
import { emitWhereTypes } from "./emit-where-types";
import { emitAuth } from "./emit-auth";
import { emitHonoRouter } from "./emit-router-hono";
import { emitSdkBundle } from "./emit-sdk-bundle";
import { emitCoreOperations } from "./emit-core-operations";
import { emitTableTest, emitTestSetup, emitDockerCompose, emitTestScript, emitVitestConfig, emitTestGitignore } from "./emit-tests";
import { emitUnifiedContract } from "./emit-sdk-contract";
import { ensureDirs, writeFilesIfChanged } from "./utils";
import type { Config } from "./types";
import { normalizeAuthConfig, getAuthStrategy } from "./types";

export async function generate(configPath: string) {
  // Check if config file exists
  if (!existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}\n\n` +
      `Run 'postgresdk init' to create a config file, or specify a custom path with:\n` +
      `  postgresdk generate --config <path>`
    );
  }

  // Load config
  const configUrl = pathToFileURL(configPath).href;
  const module = await import(configUrl);
  const rawCfg: Config = module.default || module;

  // Normalize auth config to handle simplified syntax
  const normalizedAuth = normalizeAuthConfig(rawCfg.auth);
  const cfg: Config = { ...rawCfg, auth: normalizedAuth };

  console.log("🔍 Introspecting database...");
  const model = await introspect(cfg.connectionString, cfg.schema || "public");

  console.log("🔗 Building relationship graph...");
  const graph = buildGraph(model);

  // Handle outDir configuration
  let serverDir: string;
  let originalClientDir: string;

  if (typeof cfg.outDir === "string") {
    // Single string: use for both
    serverDir = cfg.outDir;
    originalClientDir = cfg.outDir;
  } else if (cfg.outDir && typeof cfg.outDir === "object") {
    // Object with client/server paths
    serverDir = cfg.outDir.server;
    originalClientDir = cfg.outDir.client;
  } else {
    // Defaults
    serverDir = "./api/server";
    originalClientDir = "./api/client";
  }

  // If server and client dirs are the same, put client SDK in an 'sdk' subdirectory
  const sameDirectory = serverDir === originalClientDir;
  let clientDir = originalClientDir;
  if (sameDirectory) {
    clientDir = join(originalClientDir, "sdk");
  }
  const serverFramework = cfg.serverFramework || "hono";

  // Test configuration
  const generateTests = cfg.tests?.generate ?? false;
  const originalTestDir = cfg.tests?.output || "./api/tests";
  
  // If test dir is the same as server or client dir, put tests in a 'tests' subdirectory
  let testDir = originalTestDir;
  if (generateTests && (originalTestDir === serverDir || originalTestDir === originalClientDir)) {
    testDir = join(originalTestDir, "tests");
  }
  
  const testFramework = cfg.tests?.framework || "vitest";

  console.log("📁 Creating directories...");
  const dirs = [
    serverDir,
    join(serverDir, "types"),
    join(serverDir, "zod"),
    join(serverDir, "routes"),
    clientDir,
    join(clientDir, "types"),
    join(clientDir, "zod"),
    join(clientDir, "params"),
  ];
  
  if (generateTests) {
    dirs.push(testDir);
  }
  
  await ensureDirs(dirs);

  const files = [];

  // include-spec (shared)
  const includeSpec = emitIncludeSpec(graph);
  files.push({ path: join(serverDir, "include-spec.ts"), content: includeSpec });
  files.push({ path: join(clientDir, "include-spec.ts"), content: includeSpec });

  // shared params zod (client only)
  files.push({ path: join(clientDir, "params", "shared.ts"), content: emitSharedParamsZod() });

  // shared types (client only)
  files.push({ path: join(clientDir, "types", "shared.ts"), content: emitSharedTypes() });

  // base-client (client only)
  files.push({ path: join(clientDir, "base-client.ts"), content: emitBaseClient() });

  // where-types (client only)
  files.push({ path: join(clientDir, "where-types.ts"), content: emitWhereTypes() });

  // include-builder (server)
  files.push({
    path: join(serverDir, "include-builder.ts"),
    content: emitIncludeBuilder(graph, cfg.includeMethodsDepth || 2),
  });

  // include-loader (server)
  files.push({
    path: join(serverDir, "include-loader.ts"),
    content: emitIncludeLoader(graph, model, cfg.includeMethodsDepth || 2, cfg.useJsExtensions),
  });

  // logger (server)
  files.push({ path: join(serverDir, "logger.ts"), content: emitLogger() });

  // auth (server) - only if auth is configured
  if (getAuthStrategy(normalizedAuth) !== "none") {
    files.push({ path: join(serverDir, "auth.ts"), content: emitAuth(normalizedAuth) });
  }

  // core operations (server) - framework-agnostic database operations
  files.push({ 
    path: join(serverDir, "core", "operations.ts"), 
    content: emitCoreOperations() 
  });

  // per-table outputs
  if (process.env.SDK_DEBUG) {
    console.log(`[Index] About to process ${Object.keys(model.tables || {}).length} tables for generation`);
  }
  for (const table of Object.values(model.tables)) {
    // types (server + client)
    const numericMode = cfg.numericMode ?? "auto";
    const typesSrc = emitTypes(table, { numericMode }, model.enums);
    files.push({ path: join(serverDir, "types", `${table.name}.ts`), content: typesSrc });
    files.push({ path: join(clientDir, "types", `${table.name}.ts`), content: typesSrc });

    // zod (server + client)
    const zodSrc = emitZod(table, { numericMode }, model.enums);
    files.push({ path: join(serverDir, "zod", `${table.name}.ts`), content: zodSrc });
    files.push({ path: join(clientDir, "zod", `${table.name}.ts`), content: zodSrc });

    // params zod (client only)
    const paramsZodSrc = emitParamsZod(table, graph);
    files.push({ path: join(clientDir, "params", `${table.name}.ts`), content: paramsZodSrc });

    // routes (based on selected framework)
    let routeContent: string;
    if (serverFramework === "hono") {
      routeContent = emitHonoRoutes(table, graph, {
        softDeleteColumn: cfg.softDeleteColumn || null,
        includeMethodsDepth: cfg.includeMethodsDepth || 2,
        authStrategy: getAuthStrategy(normalizedAuth),
        useJsExtensions: cfg.useJsExtensions,
        apiPathPrefix: cfg.apiPathPrefix || "/v1",
      });
    } else {
      // For future framework support (express, fastify, etc.)
      throw new Error(`Framework "${serverFramework}" is not yet supported. Currently only "hono" is available.`);
    }
    
    files.push({
      path: join(serverDir, "routes", `${table.name}.ts`),
      content: routeContent,
    });

    // client
    files.push({
      path: join(clientDir, `${table.name}.ts`),
      content: emitClient(table, graph, {
        useJsExtensions: cfg.useJsExtensionsClient,
        includeMethodsDepth: cfg.includeMethodsDepth ?? 2,
        skipJunctionTables: cfg.skipJunctionTables ?? true
      }, model),
    });
  }

  // client index (SDK)
  files.push({
    path: join(clientDir, "index.ts"),
    content: emitClientIndex(Object.values(model.tables), cfg.useJsExtensionsClient),
  });

  // server router (with createRouter and registerAllRoutes helpers)
  if (serverFramework === "hono") {
    files.push({
      path: join(serverDir, "router.ts"),
      content: emitHonoRouter(Object.values(model.tables), getAuthStrategy(normalizedAuth) !== "none", cfg.useJsExtensions, cfg.pullToken),
    });
  }
  // Future: Add emitExpressRouter, emitFastifyRouter, etc.

  // Generate unified contract with both API and SDK documentation
  const { generateUnifiedContract, generateUnifiedContractMarkdown } = await import("./emit-sdk-contract");
  // Debug: Check model before passing it
  if (process.env.SDK_DEBUG) {
    console.log(`[Index] Model has ${Object.keys(model.tables || {}).length} tables before contract generation`);
  }
  const contract = generateUnifiedContract(model, cfg, graph);
  files.push({
    path: join(serverDir, "CONTRACT.md"),
    content: generateUnifiedContractMarkdown(contract),
  });
  
  // Also include contract with the client SDK for postgresdk pull
  files.push({
    path: join(clientDir, "CONTRACT.md"),
    content: generateUnifiedContractMarkdown(contract),
  });

  // Generate unified contract TypeScript code
  const contractCode = emitUnifiedContract(model, cfg, graph);
  files.push({
    path: join(serverDir, "contract.ts"),
    content: contractCode,
  });

  // Generate SDK bundle for serving from API
  // When looking for client files, we need to use the actual path where they were written
  const clientFiles = files.filter(f => {
    // Check if the file path contains the client directory (including sdk subdir if applicable)
    return f.path.includes(clientDir);
  });
  
  files.push({
    path: join(serverDir, "sdk-bundle.ts"),
    content: emitSdkBundle(clientFiles, clientDir),
  });

  // Generate tests if configured
  if (generateTests) {
    console.log("🧪 Generating tests...");
    
    // Calculate relative path from test dir to client dir
    const relativeClientPath = relative(testDir, clientDir);
    
    // Test setup files
    files.push({
      path: join(testDir, "setup.ts"),
      content: emitTestSetup(relativeClientPath, testFramework),
    });
    
    files.push({
      path: join(testDir, "docker-compose.yml"),
      content: emitDockerCompose(),
    });
    
    files.push({
      path: join(testDir, "run-tests.sh"),
      content: emitTestScript(testFramework, testDir),
    });
    
    files.push({
      path: join(testDir, ".gitignore"),
      content: emitTestGitignore(),
    });
    
    // Add vitest config if using vitest
    if (testFramework === "vitest") {
      files.push({
        path: join(testDir, "vitest.config.ts"),
        content: emitVitestConfig(),
      });
    }
    
    // Generate test for each table
    for (const table of Object.values(model.tables)) {
      files.push({
        path: join(testDir, `${table.name}.test.ts`),
        content: emitTableTest(table, model, relativeClientPath, testFramework),
      });
    }
  }

  console.log("✍️  Writing files...");
  const writeResult = await writeFilesIfChanged(files);

  if (writeResult.written === 0) {
    console.log(`✅ All ${writeResult.unchanged} files up-to-date (no changes)`);
  } else {
    console.log(`✅ Updated ${writeResult.written} files, ${writeResult.unchanged} unchanged`);
  }

  console.log(`  Server: ${serverDir}`);
  console.log(`  Client: ${sameDirectory ? clientDir + " (in sdk subdir due to same output dir)" : clientDir}`);
  
  if (generateTests) {
    const testsInSubdir = originalTestDir === serverDir || originalTestDir === originalClientDir;
    console.log(`  Tests: ${testsInSubdir ? testDir + " (in tests subdir due to same output dir)" : testDir}`);
    console.log(`  📝 Test setup:`);
    console.log(`     1. Make script executable: chmod +x ${testDir}/run-tests.sh`);
    console.log(`     2. Edit the script to configure your API server startup`);
    console.log(`     3. Run tests: ${testDir}/run-tests.sh`);
  }

  // Usage instructions
  console.log(`\n📚 Usage:`);
  console.log(`  Server (${serverFramework}):`);
  console.log(`    import { createRouter } from "./${relative(process.cwd(), serverDir)}/router";`);
  console.log(`    const api = createRouter({ pg });`);
  console.log(`    app.route("/", api);`);
  console.log(`\n  Client:`);
  console.log(`    import { SDK } from "./${relative(process.cwd(), clientDir)}";`);
  console.log(`    const sdk = new SDK({ baseUrl: "<your-api-url>" });`);
  console.log(`    const users = await sdk.users.list();`);
  console.log(`\n  Client (separate app):`);
  console.log(`    # Using CLI`);
  console.log(`    postgresdk pull --from=<your-api-url> --output=./src/sdk`);
  console.log(`\n    # Using config file (recommended)`);
  console.log(`    Create postgresdk.config.ts:`);
  console.log(`      export default { pull: { from: "<your-api-url>", output: "./src/sdk" } }`);
  console.log(`    Then run: postgresdk pull`);
}
