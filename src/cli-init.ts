#!/usr/bin/env node
import { existsSync, writeFileSync, readFileSync, copyFileSync } from "fs";
import { resolve } from "path";
import prompts from "prompts";
import { extractConfigFields, generateMergedConfig } from "./cli-config-utils";
import type { ConfigField } from "./cli-config-utils";

const CONFIG_TEMPLATE_API = `/**
 * PostgreSDK Configuration (API-Side)
 *
 * This file configures how postgresdk generates your type-safe API and SDK
 * from your PostgreSQL database schema.
 *
 * QUICK START:
 *   1. Update the connectionString below
 *   2. Run: postgresdk generate
 *   3. Start using your generated SDK!
 *
 * CLI COMMANDS:
 *   postgresdk generate          Generate API and SDK from your database
 *   postgresdk help              Show help and examples
 *
 * Environment variables are automatically loaded from .env files.
 */

export default {
  // ========== DATABASE CONNECTION (Required) ==========

  /**
   * PostgreSQL connection string
   * Format: postgres://user:password@host:port/database
   *
   * Tip: Use environment variables to keep credentials secure
   */
  connectionString: process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb",

  // ========== BASIC OPTIONS ==========

  /**
   * Database schema to introspect
   * Default: "public"
   */
  // schema: "public",

  /**
   * Output directory for generated code
   *
   * Simple usage (same directory for both):
   *   outDir: "./api"
   *
   * Separate directories for client and server:
   *   outDir: { client: "./sdk", server: "./api" }
   *
   * Default: { client: "./api/client", server: "./api/server" }
   */
  // outDir: "./api",

  // ========== ADVANCED OPTIONS ==========

  /**
   * Column name for soft deletes. When set, DELETE operations will update
   * this column instead of removing rows.
   *
   * Default: null (hard deletes)
   * Example: "deleted_at"
   */
  // softDeleteColumn: null,

  /**
   * How to type numeric columns in TypeScript
   * Options:
   *   - "auto": int2/int4/float → number, int8/numeric → string (recommended, default)
   *   - "number": All numeric types become TypeScript number (unsafe for bigint)
   *   - "string": All numeric types become TypeScript string (legacy behavior)
   *
   * Auto mode is safest - keeps JavaScript-safe integers as numbers,
   * but preserves precision for bigint/numeric by using strings.
   *
   * Default: "auto"
   */
  // numericMode: "auto",

  /**
   * Maximum depth for nested relationship includes to prevent infinite loops
   * Default: 2
   */
  // includeMethodsDepth: 2,


  /**
   * Server framework for generated API routes
   * Options:
   *   - "hono": Lightweight, edge-compatible web framework (default)
   *   - "express": Traditional Node.js framework (planned)
   *   - "fastify": High-performance Node.js framework (planned)
   *
   * Default: "hono"
   */
  // serverFramework: "hono",

  /**
   * Use .js extensions in server imports (for Vercel Edge, Deno, etc.)
   * Default: false
   */
  // useJsExtensions: false,

  /**
   * Use .js extensions in client SDK imports (rarely needed)
   * Default: false
   */
  // useJsExtensionsClient: false,

  // ========== TEST GENERATION ==========

  /**
   * Generate basic SDK tests with Docker setup
   * Uncomment to enable test generation
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
   * SIMPLE SYNTAX (recommended):
   *   auth: { apiKey: process.env.API_KEY }
   *   auth: { jwt: process.env.JWT_SECRET }
   *   auth: { apiKeys: [process.env.KEY1, process.env.KEY2] }
   *
   * FULL SYNTAX (advanced):
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
  //     services: [                            // Array of services that can authenticate
  //       { issuer: "web-app", secret: process.env.WEB_APP_SECRET },
  //       { issuer: "mobile-app", secret: process.env.MOBILE_SECRET },
  //     ],
  //     audience: "my-api",                    // Optional: validate 'aud' claim
  //   }
  // },

  // ========== SDK ENDPOINT PROTECTION ==========

  /**
   * Token for protecting /_psdk/* endpoints (SDK distribution and contract endpoints)
   *
   * When set, clients must provide this token via Authorization header when pulling SDK.
   * If not set, /_psdk/* endpoints are publicly accessible.
   *
   * This is separate from the main auth strategy (JWT/API key) used for CRUD operations.
   *
   * Use "env:" prefix to read from environment variables:
   *   pullToken: "env:POSTGRESDK_PULL_TOKEN"
   */
  // pullToken: "env:POSTGRESDK_PULL_TOKEN",
};
`;

const CONFIG_TEMPLATE_SDK = `/**
 * PostgreSDK Configuration (SDK-Side)
 *
 * This file configures how postgresdk pulls a generated SDK from a remote API.
 *
 * QUICK START:
 *   1. Update the 'pull.from' URL below
 *   2. Run: postgresdk pull
 *   3. Import and use the SDK!
 *
 * CLI COMMANDS:
 *   postgresdk pull              Pull SDK from a remote API
 *   postgresdk help              Show help and examples
 *
 * Environment variables are automatically loaded from .env files.
 */

export default {
  // ========== SDK PULL CONFIGURATION ==========

  /**
   * Configuration for pulling SDK from a remote API
   */
  pull: {
    from: "https://api.myapp.com",        // API URL to pull SDK from
    output: "./src/sdk",                   // Local directory for pulled SDK

    /**
     * Authentication token for protected /_psdk/* endpoints
     * Should match the server's pullToken configuration
     *
     * Use "env:" prefix to read from environment variables:
     *   pullToken: "env:POSTGRESDK_PULL_TOKEN"
     */
    // pullToken: "env:POSTGRESDK_PULL_TOKEN",
  },
};
`;

export async function initCommand(args: string[]): Promise<void> {
  console.log("🚀 Initializing postgresdk configuration...\n");

  // Check for flags and subcommands
  const forceError = args.includes("--force-error");
  const isApiSide = args.includes("--api");
  const isSdkSide = args.includes("--sdk") || args[0] === "pull";

  // Check for existing config file
  const configPath = resolve(process.cwd(), "postgresdk.config.ts");
  
  if (existsSync(configPath)) {
    // In test mode, fail immediately
    if (forceError) {
      console.error("❌ Error: postgresdk.config.ts already exists");
      console.log("   To reinitialize, please remove or rename the existing file first.");
      process.exit(1);
    }
    console.log("⚠️  Found existing postgresdk.config.ts\n");
    
    // Read existing config
    const existingContent = readFileSync(configPath, "utf-8");
    const existingFields = extractConfigFields(existingContent);
    
    // Show what we found
    console.log("📋 Existing configuration detected:");
    existingFields.forEach(field => {
      if (!field.isCommented) {
        console.log(`   • ${field.description}: ${field.value}`);
      }
    });
    console.log();
    
    // Ask user how to proceed
    const { mergeStrategy } = await prompts({
      type: "select",
      name: "mergeStrategy",
      message: "How would you like to proceed?",
      choices: [
        { 
          title: "Keep existing values and add new options", 
          value: "keep-existing",
          description: "Preserves your current settings while adding any new configuration options"
        },
        { 
          title: "Interactive merge (recommended)", 
          value: "interactive",
          description: "Review each setting and choose what to keep"
        },
        { 
          title: "Replace with fresh defaults", 
          value: "use-defaults",
          description: "Creates a new config with default values (backs up existing)"
        },
        { 
          title: "Cancel", 
          value: "cancel",
          description: "Exit without making changes"
        }
      ],
      initial: 1
    });
    
    if (!mergeStrategy || mergeStrategy === "cancel") {
      console.log("\n✅ Cancelled. No changes made.");
      process.exit(0);
    }
    
    let userChoices: Map<string, any> | undefined;
    
    // Interactive merge
    if (mergeStrategy === "interactive") {
      userChoices = new Map();
      
      console.log("\n🔄 Let's review your configuration:\n");
      
      // For each existing non-commented field, ask if they want to keep it
      for (const field of existingFields.filter(f => !f.isCommented)) {
        const { choice } = await prompts({
          type: "select",
          name: "choice",
          message: `${field.description}:\n   Current: ${field.value}\n   Action:`,
          choices: [
            { title: "Keep current value", value: "keep" },
            { title: "Use default value", value: "new" },
          ],
          initial: 0
        });
        
        if (!choice) {
          console.log("\n✅ Cancelled. No changes made.");
          process.exit(0);
        }
        
        userChoices.set(field.key, choice);
      }
      
      // Ask about new options that weren't in the existing config
      const newOptions = [
        { key: "tests", description: "Enable test generation" },
        { key: "auth", description: "Add authentication" },
        { key: "pullToken", description: "Add SDK endpoint protection" },
        { key: "pull", description: "Configure SDK distribution" }
      ];
      
      const existingKeys = new Set(existingFields.map(f => f.key));
      const missingOptions = newOptions.filter(opt => !existingKeys.has(opt.key));
      
      if (missingOptions.length > 0) {
        console.log("\n📦 New configuration options available:\n");
        
        for (const option of missingOptions) {
          const { addOption } = await prompts({
            type: "confirm",
            name: "addOption",
            message: `Add ${option.description} configuration? (commented out by default)`,
            initial: false
          });
          
          if (addOption) {
            userChoices.set(option.key, "add-commented");
          }
        }
      }
    }
    
    // Backup existing config
    const backupPath = configPath + ".backup." + Date.now();
    copyFileSync(configPath, backupPath);
    console.log(`\n💾 Backed up existing config to: ${backupPath}`);
    
    // Generate merged config
    const mergedConfig = generateMergedConfig(
      existingFields,
      mergeStrategy as "keep-existing" | "use-defaults" | "interactive",
      userChoices
    );
    
    // Write the new config
    try {
      writeFileSync(configPath, mergedConfig, "utf-8");
      console.log("✅ Updated postgresdk.config.ts with merged configuration");
      console.log("\n💡 Your previous config has been backed up.");
      console.log("   Run 'postgresdk generate' to create your SDK with the new config.");
    } catch (error) {
      console.error("❌ Error updating config file:", error);
      console.log(`   Your backup is available at: ${backupPath}`);
      process.exit(1);
    }
    
    return;
  }
  
  // Determine project type from flags or prompt
  let projectType: string;

  if (isApiSide && isSdkSide) {
    console.error("❌ Error: Cannot use both --api and --sdk/pull options");
    process.exit(1);
  } else if (isApiSide) {
    projectType = "api";
  } else if (isSdkSide) {
    projectType = "sdk";
  } else {
    // Ask interactively
    const response = await prompts({
      type: "select",
      name: "projectType",
      message: "What type of project is this?",
      choices: [
        {
          title: "API-side (generating SDK from database)",
          value: "api",
          description: "You have a PostgreSQL database and want to generate an SDK"
        },
        {
          title: "SDK-side (consuming a remote SDK)",
          value: "sdk",
          description: "You want to pull and use an SDK from a remote API"
        }
      ],
      initial: 0
    });

    projectType = response.projectType;

    if (!projectType) {
      console.log("\n✅ Cancelled. No changes made.");
      process.exit(0);
    }
  }

  const template = projectType === "api" ? CONFIG_TEMPLATE_API : CONFIG_TEMPLATE_SDK;

  // Check for .env file
  const envPath = resolve(process.cwd(), ".env");
  const hasEnv = existsSync(envPath);

  // Write the config file
  try {
    writeFileSync(configPath, template, "utf-8");
    console.log("✅ Created postgresdk.config.ts");

    // Provide helpful next steps
    console.log("\n📝 Next steps:");

    if (projectType === "api") {
      console.log("   1. Edit postgresdk.config.ts with your database connection");

      if (!hasEnv) {
        console.log("   2. Consider creating a .env file for sensitive values:");
        console.log("      DATABASE_URL=postgres://user:pass@localhost:5432/mydb");
        console.log("      API_KEY=your-secret-key");
        console.log("      JWT_SECRET=your-jwt-secret");
        console.log("      POSTGRESDK_PULL_TOKEN=your-pull-token");
      }

      console.log("   3. Run 'postgresdk generate' to create your SDK");
    } else {
      console.log("   1. Edit postgresdk.config.ts with your API URL in pull.from");

      if (!hasEnv) {
        console.log("   2. Consider creating a .env file if you need authentication:");
        console.log("      POSTGRESDK_PULL_TOKEN=your-pull-token");
      }

      console.log("   3. Run 'postgresdk pull' to fetch your SDK");
    }

    console.log("\n💡 Tip: The config file has detailed comments for all options.");
    console.log("   Uncomment the options you want to customize.");

  } catch (error) {
    console.error("❌ Error creating config file:", error);
    process.exit(1);
  }
}
