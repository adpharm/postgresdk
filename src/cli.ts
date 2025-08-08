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

// Handle --version
if (args.includes("--version") || args.includes("-v")) {
  console.log(`postgresdk v${VERSION}`);
  process.exit(0);
}

// Handle --help
if (args.includes("--help") || args.includes("-h")) {
  console.log(`
postgresdk - Generate typed SDK from PostgreSQL

Usage:
  postgresdk [options]

Options:
  -c, --config <path>  Path to config file (default: postgresdk.config.ts)
  -v, --version        Show version
  -h, --help           Show help
`);
  process.exit(0);
}

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