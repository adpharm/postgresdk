// Load environment variables first, before any other imports
import "dotenv/config";

import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { introspect } from "./introspect";
import { buildGraph } from "./rel-classify";
import { emitIncludeSpec } from "./emit-include-spec";
import { emitIncludeBuilder } from "./emit-include-builder";
import { emitZod } from "./emit-zod";
import { emitParamsZod } from "./emit-params-zod";
import { emitSharedParamsZod } from "./emit-shared-params-zod";
import { emitHonoRoutes } from "./emit-routes-hono";
import { emitClient, emitClientIndex } from "./emit-client";
import { emitBaseClient } from "./emit-base-client";
import { emitIncludeLoader } from "./emit-include-loader";
import { emitTypes } from "./emit-types";
import { emitLogger } from "./emit-logger";
import { emitAuth } from "./emit-auth";
import { emitHonoRouter } from "./emit-router-hono";
import { emitSdkBundle } from "./emit-sdk-bundle";
import { emitCoreOperations } from "./emit-core-operations";
import { emitTableTest, emitTestSetup, emitDockerCompose, emitTestScript, emitVitestConfig, emitTestGitignore } from "./emit-tests";
import { emitUnifiedContract } from "./emit-sdk-contract";
import { ensureDirs, writeFiles } from "./utils";
import type { Config } from "./types";
import { normalizeAuthConfig } from "./types";

export async function generate(configPath: string) {
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

  const serverDir = cfg.outServer || "./api/server";
  const originalClientDir = cfg.outClient || "./api/client";
  
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

  // base-client (client only)
  files.push({ path: join(clientDir, "base-client.ts"), content: emitBaseClient() });

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
  if (normalizedAuth?.strategy && normalizedAuth.strategy !== "none") {
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
    const typesSrc = emitTypes(table, { numericMode: "string" });
    files.push({ path: join(serverDir, "types", `${table.name}.ts`), content: typesSrc });
    files.push({ path: join(clientDir, "types", `${table.name}.ts`), content: typesSrc });

    // zod (server + client)
    const zodSrc = emitZod(table, { numericMode: "string" });
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
        includeDepthLimit: cfg.includeMethodsDepth || 2,
        authStrategy: normalizedAuth?.strategy,
        useJsExtensions: cfg.useJsExtensions,
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
      content: emitHonoRouter(Object.values(model.tables), !!normalizedAuth?.strategy && normalizedAuth.strategy !== "none", cfg.useJsExtensions),
    });
  }
  // Future: Add emitExpressRouter, emitFastifyRouter, etc.

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

  // Generate unified contract with both API and SDK documentation
  const contractCode = emitUnifiedContract(model, cfg);
  files.push({
    path: join(serverDir, "contract.ts"),
    content: contractCode,
  });
  
  // Also generate a markdown version for easy reading
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
  await writeFiles(files);

  console.log(`✅ Generated ${files.length} files`);
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
}
