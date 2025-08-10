// Load environment variables first, before any other imports
import "dotenv/config";

import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { introspect } from "./introspect";
import { buildGraph } from "./rel-classify";
import { emitIncludeSpec } from "./emit-include-spec";
import { emitIncludeBuilder } from "./emit-include-builder";
import { emitZod } from "./emit-zod";
import { emitRoutes } from "./emit-routes";
import { emitClient, emitClientIndex } from "./emit-client";
import { emitBaseClient } from "./emit-base-client";
import { emitIncludeLoader } from "./emit-include-loader";
import { emitTypes } from "./emit-types";
import { emitLogger } from "./emit-logger";
import { emitAuth } from "./emit-auth";
import { emitRouter } from "./emit-router";
import { emitSdkBundle } from "./emit-sdk-bundle";
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

  const serverDir = cfg.outServer || "./generated/server";
  const originalClientDir = cfg.outClient || "./generated/client";
  
  // If server and client dirs are the same, put client SDK in an 'sdk' subdirectory
  const sameDirectory = serverDir === originalClientDir;
  let clientDir = originalClientDir;
  if (sameDirectory) {
    clientDir = join(originalClientDir, "sdk");
  }
  const normDateType = cfg.dateType === "string" ? "string" : "date";

  console.log("📁 Creating directories...");
  await ensureDirs([
    serverDir,
    join(serverDir, "types"),
    join(serverDir, "zod"),
    join(serverDir, "routes"),
    clientDir,
    join(clientDir, "types"),
  ]);

  const files = [];

  // include-spec (shared)
  const includeSpec = emitIncludeSpec(graph);
  files.push({ path: join(serverDir, "include-spec.ts"), content: includeSpec });
  files.push({ path: join(clientDir, "include-spec.ts"), content: includeSpec });

  // base-client (client only)
  files.push({ path: join(clientDir, "base-client.ts"), content: emitBaseClient() });

  // include-builder (server)
  files.push({
    path: join(serverDir, "include-builder.ts"),
    content: emitIncludeBuilder(graph, cfg.includeDepthLimit || 3),
  });

  // include-loader (server)
  files.push({
    path: join(serverDir, "include-loader.ts"),
    content: emitIncludeLoader(graph, model, cfg.includeDepthLimit || 3),
  });

  // logger (server)
  files.push({ path: join(serverDir, "logger.ts"), content: emitLogger() });

  // auth (server) - only if auth is configured
  if (normalizedAuth?.strategy && normalizedAuth.strategy !== "none") {
    files.push({ path: join(serverDir, "auth.ts"), content: emitAuth(normalizedAuth) });
  }

  // per-table outputs
  for (const table of Object.values(model.tables)) {
    // types (server + client)
    const typesSrc = emitTypes(table, { dateType: normDateType, numericMode: "string" });
    files.push({ path: join(serverDir, "types", `${table.name}.ts`), content: typesSrc });
    files.push({ path: join(clientDir, "types", `${table.name}.ts`), content: typesSrc });

    // zod
    files.push({
      path: join(serverDir, "zod", `${table.name}.ts`),
      content: emitZod(table, { dateType: normDateType, numericMode: "string" }),
    });

    // routes
    files.push({
      path: join(serverDir, "routes", `${table.name}.ts`),
      content: emitRoutes(table, graph, {
        softDeleteColumn: cfg.softDeleteColumn || null,
        includeDepthLimit: cfg.includeDepthLimit || 3,
        authStrategy: normalizedAuth?.strategy,
      }),
    });

    // client
    files.push({
      path: join(clientDir, `${table.name}.ts`),
      content: emitClient(table),
    });
  }

  // client index (SDK)
  files.push({
    path: join(clientDir, "index.ts"),
    content: emitClientIndex(Object.values(model.tables)),
  });

  // server router (with createRouter and registerAllRoutes helpers)
  files.push({
    path: join(serverDir, "router.ts"),
    content: emitRouter(Object.values(model.tables), !!normalizedAuth?.strategy && normalizedAuth.strategy !== "none"),
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

  console.log("✍️  Writing files...");
  await writeFiles(files);

  console.log(`✅ Generated ${files.length} files`);
  console.log(`  Server: ${serverDir}`);
  console.log(`  Client: ${sameDirectory ? clientDir + " (in sdk subdir due to same output dir)" : clientDir}`);
}
