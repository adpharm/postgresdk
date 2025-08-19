#!/usr/bin/env bun

import { mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";

const TEST_DIR = "test/.real-test";

// Clean up
if (existsSync(TEST_DIR)) {
  rmSync(TEST_DIR, { recursive: true });
}
mkdirSync(TEST_DIR, { recursive: true });

// Create a test config
const configContent = `export default {
  connectionString: process.env.DATABASE_URL || "postgres://test:test@localhost:5432/testdb",
  schema: "public",
  outServer: "./api/server",
};`;

await Bun.write(join(TEST_DIR, "postgresdk.config.ts"), configContent);

// Now run the actual init command
console.log("Running init command with existing config...");
console.log("Please select:");
console.log("1. Keep existing values (first option)");
console.log("2. Check the generated config\n");

// Run with keep-existing option
const { spawn } = require("child_process");
const child = spawn("bun", [join(process.cwd(), "src/cli.ts"), "init"], {
  cwd: TEST_DIR,
  stdio: "inherit"
});

child.on("close", async (code) => {
  if (code === 0) {
    console.log("\n✅ Init completed. Check the config at:");
    console.log(`   ${TEST_DIR}/postgresdk.config.ts`);
    
    // Read and display the relevant lines
    const result = await Bun.file(join(TEST_DIR, "postgresdk.config.ts")).text();
    const lines = result.split('\n');
    
    console.log("\nKey lines from generated config:");
    lines.forEach((line, i) => {
      if (line.includes('connectionString:') || 
          line.includes('schema:') || 
          line.includes('outServer:')) {
        console.log(`Line ${i+1}: ${line}`);
      }
    });
  }
});