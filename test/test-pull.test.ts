import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { execSync, spawn, ChildProcess } from "child_process";
import { join } from "path";
import { TEST_PATHS, TEST_PORTS, CLI_PATH, ensurePostgresRunning } from "./test-utils";

const SERVER_DIR = TEST_PATHS.gen + "/server";

describe("SDK pull functionality", () => {
  let serverProc: ChildProcess | null = null;

  beforeAll(async () => {
    await ensurePostgresRunning();

    // Cleanup from previous runs
    if (existsSync(TEST_PATHS.pull)) {
      rmSync(TEST_PATHS.pull, { recursive: true, force: true });
    }
    if (existsSync(TEST_PATHS.pullConfig)) {
      rmSync(TEST_PATHS.pullConfig, { recursive: true, force: true });
    }
    if (existsSync(TEST_PATHS.pullToken)) {
      rmSync(TEST_PATHS.pullToken, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    if (serverProc) {
      serverProc.kill();
    }
  });

  test("ensure SDK is generated before pull", async () => {
    // If SDK doesn't exist, generate it
    if (!existsSync(join(SERVER_DIR, "router.ts"))) {
      console.log("SDK not found, generating...");
      execSync(`bun ${CLI_PATH} generate -c gen.config.ts`, { stdio: "inherit" });
    }

    // Verify server files exist
    expect(existsSync(join(SERVER_DIR, "router.ts"))).toBe(true);
    expect(existsSync(join(SERVER_DIR, "sdk-bundle.ts"))).toBe(true);
  }, 60000);

  test("start test server for pull", async () => {
    const serverCode = `
      import { Hono } from "hono";
      import { serve } from "@hono/node-server";
      import { createRouter } from "${process.cwd()}/${SERVER_DIR}/router";

      const app = new Hono();
      const mockPg = { query: async () => ({ rows: [] }) };
      const router = createRouter({ pg: mockPg });
      app.route("/", router);

      const server = serve({
        fetch: app.fetch,
        port: ${TEST_PORTS.pull}
      });

      console.log("Test server ready on port ${TEST_PORTS.pull}");
    `;

    // Write and start server
    writeFileSync("/tmp/test-pull-server.ts", serverCode);
    serverProc = spawn("bun", ["/tmp/test-pull-server.ts"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    // Wait for server to be ready
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Server startup timeout")), 10000);
      serverProc!.stdout?.on("data", (data) => {
        if (data.toString().includes("ready")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      serverProc!.stderr?.on("data", (data) => {
        console.error("Server error:", data.toString());
      });
    });
  }, 15000);

  test("pull SDK with CLI arguments", async () => {
    execSync(
      `bun ${CLI_PATH} pull --from=http://localhost:${TEST_PORTS.pull} --output=${TEST_PATHS.pull}`,
      { stdio: "inherit" }
    );

    // Verify pulled files
    expect(existsSync(TEST_PATHS.pull)).toBe(true);

    const pulledFiles = [
      "index.ts",
      "base-client.ts",
      "authors.ts",
      "books.ts",
      "tags.ts",
      "book_tags.ts",
      ".postgresdk.json"
    ];

    for (const file of pulledFiles) {
      expect(existsSync(join(TEST_PATHS.pull, file))).toBe(true);
    }
  });

  test("pull SDK with config file", async () => {
    // Create test config
    const pullConfig = `
      export default {
        pull: {
          from: "http://localhost:${TEST_PORTS.pull}",
          output: "${TEST_PATHS.pullConfig}"
        }
      };
    `;
    writeFileSync("/tmp/test-pull.config.ts", pullConfig);

    // Run pull with config
    execSync(
      `bun ${CLI_PATH} pull -c /tmp/test-pull.config.ts`,
      { stdio: "inherit", cwd: process.cwd() }
    );

    // Verify
    expect(existsSync(TEST_PATHS.pullConfig)).toBe(true);
  });

  test("verify SDK metadata", async () => {
    const metadata = JSON.parse(
      await readFile(join(TEST_PATHS.pullConfig, ".postgresdk.json"), "utf-8")
    );

    expect(metadata.version).toBeTruthy();
    expect(metadata.generated).toBeTruthy();
    expect(metadata.pulledFrom).toBeTruthy();
    expect(metadata.pulledAt).toBeTruthy();
  });

  test("compare pulled SDK with original", async () => {
    const originalIndex = await readFile(`${TEST_PATHS.gen}/client/index.ts`, "utf-8");
    const pulledIndex = await readFile(join(TEST_PATHS.pullConfig, "index.ts"), "utf-8");

    expect(originalIndex).toBe(pulledIndex);
  });

  test("pull with authentication token", async () => {
    execSync(
      `bun ${CLI_PATH} pull --from=http://localhost:${TEST_PORTS.pull} --output=${TEST_PATHS.pullToken} --token=test-token`,
      { stdio: "inherit" }
    );

    expect(existsSync(TEST_PATHS.pullToken)).toBe(true);
  });
});
