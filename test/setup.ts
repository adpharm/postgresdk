import { beforeAll } from "vitest";
import { ensurePostgresRunning } from "./test-utils";

// Global setup: ensure PostgreSQL is running once for all tests
beforeAll(async () => {
  await ensurePostgresRunning();
}, 30000);
