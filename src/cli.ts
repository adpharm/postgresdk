#!/usr/bin/env node

// Load environment variables first, before any other imports
import "dotenv/config";

import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generate } from "./index";

// Get package.json version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
const VERSION = packageJson.version;

const args = process.argv.slice(2);
const command = args[0];

// Handle --version
if (args.includes("--version") || args.includes("-v") || command === "version") {
  console.log(`postgresdk v${VERSION}`);
  process.exit(0);
}

// Handle --help or no command
if (args.includes("--help") || args.includes("-h") || command === "help" || !command) {
  console.log(`
postgresdk - Generate typed SDK from PostgreSQL

Usage:
  postgresdk <command> [options]

Commands:
  init                 Create a postgresdk.config.ts file
  generate, gen        Generate SDK from database
  pull                 Pull SDK from API endpoint
  version              Show version
  help                 Show help

Init Options:
  (no options)

Generate Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)

Pull Options:
  --from <url>         API URL to pull SDK from
  --output <path>      Output directory (default: ./src/sdk)
  --token <token>      Authentication token
  -c, --config <path>  Path to config file with pull settings

Examples:
  postgresdk init                        # Create config file
  postgresdk generate                    # Generate using postgresdk.config.ts
  postgresdk gen                         # Short alias for generate
  postgresdk generate -c custom.config.ts
  postgresdk pull --from=https://api.com --output=./src/sdk
  postgresdk pull                        # Pull using config file
`);
  process.exit(0);
}

// Handle init command
if (command === "init") {
  const { initCommand } = await import("./cli-init");
  await initCommand(args.slice(1));
}

// Handle generate command (both 'generate' and 'gen')
else if (command === "generate" || command === "gen") {
  // Get config path
  let configPath = "postgresdk.config.ts";
  const configIndex = args.findIndex(a => a === "-c" || a === "--config");
  if (configIndex !== -1 && args[configIndex + 1]) {
    configPath = args[configIndex + 1]!;
  }

  // Run generator
  try {
    await generate(resolve(process.cwd(), configPath));
  } catch (err) {
    console.error("❌ Generation failed:", err);
    process.exit(1);
  }
}

// Handle pull command
else if (command === "pull") {
  const { pullCommand } = await import("./cli-pull");
  await pullCommand(args.slice(1));
}

// Unknown command
else {
  console.error(`❌ Unknown command: ${command}`);
  console.error(`Run 'postgresdk help' for usage information`);
  process.exit(1);
}