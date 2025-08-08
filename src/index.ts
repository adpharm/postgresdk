import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { introspect } from "./introspect";
import { buildGraph } from "./rel-classify";
import { emitIncludeSpec } from "./emit-include-spec";
import { emitIncludeBuilder } from "./emit-include-builder";
import { emitZod } from "./emit-zod";
import { emitRoutes } from "./emit-routes";
import { emitClient, emitClientIndex } from "./emit-client";
import { emitIncludeLoader } from "./emit-include-loader";
import { emitTypes } from "./emit-types";
import { emitLogger } from "./emit-logger";
import { emitAuth } from "./emit-auth";
import { emitServerIndex } from "./emit-server-index";
import { ensureDirs, writeFiles } from "./utils";
import type { Config } from "./types";

export async function generate(configPath: string) {
  // Load config
  const configUrl = pathToFileURL(configPath).href;
  const module = await import(configUrl);
  const cfg: Config = module.default || module;

  console.log("🔍 Introspecting database...");
  const model = await introspect(cfg.connectionString, cfg.schema || "public");

  console.log("🔗 Building relationship graph...");
  const graph = buildGraph(model);

  const serverDir = cfg.outServer || "./generated/server";
  const clientDir = cfg.outClient || "./generated/client";
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
  if (cfg.auth?.strategy && cfg.auth.strategy !== "none") {
    files.push({ path: join(serverDir, "auth.ts"), content: emitAuth(cfg.auth) });
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
        authStrategy: cfg.auth?.strategy,
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

  // server index (with registerAllRoutes helper)
  files.push({
    path: join(serverDir, "index.ts"),
    content: emitServerIndex(Object.values(model.tables), !!cfg.auth?.strategy && cfg.auth.strategy !== "none"),
  });

  console.log("✍️  Writing files...");
  await writeFiles(files);

  console.log(`✅ Generated ${files.length} files`);
  console.log(`  Server: ${serverDir}`);
  console.log(`  Client: ${clientDir}`);
}
