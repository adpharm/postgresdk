import cfg from "../gen.config";
import { join } from "path";
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
import { ensureDirs, writeFiles } from "./utils";

(async () => {
  const model = await introspect(cfg.connectionString, cfg.schema);
  const graph = buildGraph(model);

  const serverDir = cfg.outServer;
  const clientDir = cfg.outClient;

  const normDateType: "date" | "string" = cfg.dateType === "string" ? "string" : "date";

  await ensureDirs([
    serverDir,
    join(serverDir, "types"),
    join(serverDir, "zod"),
    join(serverDir, "routes"),
    clientDir,
    join(clientDir, "types"),
  ]);

  const files: Array<{ path: string; content: string }> = [];

  // include-spec (shared)
  const includeSpec = emitIncludeSpec(graph);
  files.push({ path: join(serverDir, "include-spec.ts"), content: includeSpec });
  files.push({ path: join(clientDir, "include-spec.ts"), content: includeSpec });

  // include-builder (server)
  files.push({
    path: join(serverDir, "include-builder.ts"),
    content: emitIncludeBuilder(graph, cfg.includeDepthLimit),
  });

  // include-loader (server)
  files.push({
    path: join(serverDir, "include-loader.ts"),
    content: emitIncludeLoader(graph, model, cfg.includeDepthLimit),
  });

  // logger (server)
  files.push({ path: join(serverDir, "logger.ts"), content: emitLogger() });

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
        softDeleteColumn: cfg.softDeleteColumn ?? null,
        includeDepthLimit: cfg.includeDepthLimit ?? 3,
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

  await writeFiles(files);
  console.log(`✓ Generated ${files.length} files`);
  console.log(`  server: ${serverDir}`);
  console.log(`  client: ${clientDir}`);
})().catch((e) => {
  console.error("❌ Generation failed", e);
  process.exit(1);
});
