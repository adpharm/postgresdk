#!/usr/bin/env node
import { existsSync, writeFileSync } from "fs";
import { resolve } from "path";

const CONFIG_TEMPLATE = `/**
 * PostgreSDK Configuration
 * 
 * This file configures how postgresdk generates your SDK.
 * Environment variables are automatically loaded from .env files.
 */

export default {
  // ========== DATABASE CONNECTION (Required) ==========
  
  /**
   * PostgreSQL connection string
   * Format: postgres://user:password@host:port/database
   */
  connectionString: process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb",
  
  // ========== BASIC OPTIONS ==========
  
  /**
   * Database schema to introspect
   * @default "public"
   */
  // schema: "public",
  
  /**
   * Output directory for server-side code (routes, validators, etc.)
   * @default "./api/server"
   */
  // outServer: "./api/server",
  
  /**
   * Output directory for client SDK
   * @default "./api/client"
   */
  // outClient: "./api/client",
  
  // ========== ADVANCED OPTIONS ==========
  
  /**
   * Column name for soft deletes. When set, DELETE operations will update
   * this column instead of removing rows.
   * @default null (hard deletes)
   * @example "deleted_at"
   */
  // softDeleteColumn: null,
  
  /**
   * Maximum depth for nested relationship includes to prevent infinite loops
   * @default 3
   */
  // includeDepthLimit: 3,
  
  
  /**
   * Server framework for generated API routes
   * - "hono": Lightweight, edge-compatible web framework (default)
   * - "express": Traditional Node.js framework (planned)
   * - "fastify": High-performance Node.js framework (planned)
   * @default "hono"
   */
  // serverFramework: "hono",
  
  /**
   * Use .js extensions in server imports (for Vercel Edge, Deno, etc.)
   * @default false
   */
  // useJsExtensions: false,
  
  /**
   * Use .js extensions in client SDK imports (rarely needed)
   * @default false
   */
  // useJsExtensionsClient: false,
  
  // ========== TEST GENERATION ==========
  
  /**
   * Generate basic SDK tests
   * Uncomment to enable test generation with Docker setup
   */
  // tests: {
  //   generate: true,
  //   output: "./api/tests",
  //   framework: "vitest"  // or "jest" or "bun"
  // },
  
  // ========== AUTHENTICATION ==========
  
  /**
   * Authentication configuration for your API
   * 
   * Simple syntax examples:
   *   auth: { apiKey: process.env.API_KEY }
   *   auth: { jwt: process.env.JWT_SECRET }
   * 
   * Multiple API keys:
   *   auth: { apiKeys: [process.env.KEY1, process.env.KEY2] }
   * 
   * Full syntax for advanced options:
   */
  // auth: {
  //   // Strategy: "none" | "api-key" | "jwt-hs256"
  //   strategy: "none",
  //   
  //   // For API Key authentication
  //   apiKeyHeader: "x-api-key",  // Header name for API key
  //   apiKeys: [                  // List of valid API keys
  //     process.env.API_KEY_1,
  //     process.env.API_KEY_2,
  //   ],
  //   
  //   // For JWT (HS256) authentication
  //   jwt: {
  //     sharedSecret: process.env.JWT_SECRET,  // Secret for signing/verifying
  //     issuer: "my-app",                      // Optional: validate 'iss' claim
  //     audience: "my-users",                  // Optional: validate 'aud' claim
  //   }
  // },
  
  // ========== SDK DISTRIBUTION (Pull Configuration) ==========
  
  /**
   * Configuration for pulling SDK from a remote API
   * Used when running 'postgresdk pull' command
   */
  // pull: {
  //   from: "https://api.myapp.com",     // API URL to pull SDK from
  //   output: "./src/sdk",                // Local directory for pulled SDK
  //   token: process.env.API_TOKEN,       // Optional authentication token
  // },
};
`;

export async function initCommand(args: string[]): Promise<void> {
  console.log("🚀 Initializing postgresdk configuration...\n");
  
  // Check for existing config file
  const configPath = resolve(process.cwd(), "postgresdk.config.ts");
  
  if (existsSync(configPath)) {
    console.error("❌ Error: postgresdk.config.ts already exists");
    console.log("   To reinitialize, please remove or rename the existing file first.");
    process.exit(1);
  }
  
  // Check for .env file
  const envPath = resolve(process.cwd(), ".env");
  const hasEnv = existsSync(envPath);
  
  // Write the config file
  try {
    writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
    console.log("✅ Created postgresdk.config.ts");
    
    // Provide helpful next steps
    console.log("\n📝 Next steps:");
    console.log("   1. Edit postgresdk.config.ts with your database connection");
    
    if (!hasEnv) {
      console.log("   2. Consider creating a .env file for sensitive values:");
      console.log("      DATABASE_URL=postgres://user:pass@localhost:5432/mydb");
      console.log("      API_KEY=your-secret-key");
      console.log("      JWT_SECRET=your-jwt-secret");
    }
    
    console.log("   3. Run 'postgresdk generate' to create your SDK");
    console.log("\n💡 Tip: The config file has detailed comments for all options.");
    console.log("   Uncomment the options you want to customize.");
    
  } catch (error) {
    console.error("❌ Error creating config file:", error);
    process.exit(1);
  }
}