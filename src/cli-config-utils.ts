import { readFileSync } from "fs";
import type { Config } from "./types";

export interface ConfigField {
  key: string;
  value: any;
  description: string;
  isRequired?: boolean;
  isCommented?: boolean;
}

export function parseExistingConfig(configPath: string): { config: Config | null; raw: string } {
  try {
    const raw = readFileSync(configPath, "utf-8");
    
    // Try to import and execute the config
    // For now, we'll just return the raw content
    // In production, we'd need to actually import this module
    return { config: null, raw };
  } catch (error) {
    return { config: null, raw: "" };
  }
}

export function extractConfigFields(configContent: string): ConfigField[] {
  const fields: ConfigField[] = [];
  
  // Extract connection string
  const connectionMatch = configContent.match(/connectionString:\s*(.+),?$/m);
  if (connectionMatch) {
    fields.push({
      key: "connectionString",
      value: connectionMatch[1]?.trim(),
      description: "PostgreSQL connection string",
      isRequired: true,
      isCommented: false,
    });
  }
  
  // Extract schema
  const schemaMatch = configContent.match(/^\s*(\/\/)?\s*schema:\s*"(.+)"/m);
  if (schemaMatch) {
    fields.push({
      key: "schema",
      value: schemaMatch[2],
      description: "Database schema to introspect",
      isCommented: !!schemaMatch[1],
    });
  }
  
  // Extract outServer
  const outServerMatch = configContent.match(/^\s*(\/\/)?\s*outServer:\s*"(.+)"/m);
  if (outServerMatch) {
    fields.push({
      key: "outServer",
      value: outServerMatch[2],
      description: "Output directory for server-side code",
      isCommented: !!outServerMatch[1],
    });
  }
  
  // Extract outClient
  const outClientMatch = configContent.match(/^\s*(\/\/)?\s*outClient:\s*"(.+)"/m);
  if (outClientMatch) {
    fields.push({
      key: "outClient",
      value: outClientMatch[2],
      description: "Output directory for client SDK",
      isCommented: !!outClientMatch[1],
    });
  }
  
  // Extract softDeleteColumn
  const softDeleteMatch = configContent.match(/^\s*(\/\/)?\s*softDeleteColumn:\s*(.+),?$/m);
  if (softDeleteMatch) {
    fields.push({
      key: "softDeleteColumn",
      value: softDeleteMatch[2]?.trim().replace(/,$/, '').replace(/["']/g, ''),
      description: "Column name for soft deletes",
      isCommented: !!softDeleteMatch[1],
    });
  }
  
  // Extract includeDepthLimit
  const depthMatch = configContent.match(/^\s*(\/\/)?\s*includeDepthLimit:\s*(\d+)/m);
  if (depthMatch) {
    fields.push({
      key: "includeDepthLimit",
      value: parseInt(depthMatch[2]!),
      description: "Maximum depth for nested relationship includes",
      isCommented: !!depthMatch[1],
    });
  }
  
  // Extract serverFramework
  const frameworkMatch = configContent.match(/^\s*(\/\/)?\s*serverFramework:\s*"(.+)"/m);
  if (frameworkMatch) {
    fields.push({
      key: "serverFramework",
      value: frameworkMatch[2],
      description: "Server framework for generated API routes",
      isCommented: !!frameworkMatch[1],
    });
  }
  
  // Extract useJsExtensions
  const jsExtMatch = configContent.match(/^\s*(\/\/)?\s*useJsExtensions:\s*(true|false)/m);
  if (jsExtMatch) {
    fields.push({
      key: "useJsExtensions",
      value: jsExtMatch[2] === "true",
      description: "Use .js extensions in server imports",
      isCommented: !!jsExtMatch[1],
    });
  }
  
  // Extract useJsExtensionsClient
  const jsExtClientMatch = configContent.match(/^\s*(\/\/)?\s*useJsExtensionsClient:\s*(true|false)/m);
  if (jsExtClientMatch) {
    fields.push({
      key: "useJsExtensionsClient",
      value: jsExtClientMatch[2] === "true",
      description: "Use .js extensions in client SDK imports",
      isCommented: !!jsExtClientMatch[1],
    });
  }
  
  // Check for tests configuration
  const testsMatch = configContent.match(/^\s*(\/\/)?\s*tests:\s*\{/m);
  if (testsMatch) {
    fields.push({
      key: "tests",
      value: "configured",
      description: "Test generation configuration",
      isCommented: !!testsMatch[1],
    });
  }
  
  // Check for auth configuration
  const authMatch = configContent.match(/^\s*(\/\/)?\s*auth:\s*\{/m);
  if (authMatch) {
    fields.push({
      key: "auth",
      value: "configured",
      description: "Authentication configuration",
      isCommented: !!authMatch[1],
    });
  }
  
  // Check for pull configuration
  const pullMatch = configContent.match(/^\s*(\/\/)?\s*pull:\s*\{/m);
  if (pullMatch) {
    fields.push({
      key: "pull",
      value: "configured",
      description: "SDK distribution configuration",
      isCommented: !!pullMatch[1],
    });
  }
  
  return fields;
}

export function generateMergedConfig(
  existingFields: ConfigField[],
  mergeStrategy: "keep-existing" | "use-defaults" | "interactive",
  userChoices: Map<string, any> | undefined = undefined
): string {
  // This will generate the new config based on merge strategy
  const template = `/**
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
  connectionString: ${getFieldValue("connectionString", existingFields, mergeStrategy, userChoices)},
  
  // ========== BASIC OPTIONS ==========
  
  /**
   * Database schema to introspect
   * @default "public"
   */
  ${getFieldLine("schema", existingFields, mergeStrategy, '"public"', userChoices)}
  
  /**
   * Output directory for server-side code (routes, validators, etc.)
   * @default "./api/server"
   */
  ${getFieldLine("outServer", existingFields, mergeStrategy, '"./api/server"', userChoices)}
  
  /**
   * Output directory for client SDK
   * @default "./api/client"
   */
  ${getFieldLine("outClient", existingFields, mergeStrategy, '"./api/client"', userChoices)}
  
  // ========== ADVANCED OPTIONS ==========
  
  /**
   * Column name for soft deletes. When set, DELETE operations will update
   * this column instead of removing rows.
   * @default null (hard deletes)
   * @example "deleted_at"
   */
  ${getFieldLine("softDeleteColumn", existingFields, mergeStrategy, 'null', userChoices)}
  
  /**
   * Maximum depth for nested relationship includes to prevent infinite loops
   * @default 3
   */
  ${getFieldLine("includeDepthLimit", existingFields, mergeStrategy, '3', userChoices)}
  
  
  /**
   * Server framework for generated API routes
   * - "hono": Lightweight, edge-compatible web framework (default)
   * - "express": Traditional Node.js framework (planned)
   * - "fastify": High-performance Node.js framework (planned)
   * @default "hono"
   */
  ${getFieldLine("serverFramework", existingFields, mergeStrategy, '"hono"', userChoices)}
  
  /**
   * Use .js extensions in server imports (for Vercel Edge, Deno, etc.)
   * @default false
   */
  ${getFieldLine("useJsExtensions", existingFields, mergeStrategy, 'false', userChoices)}
  
  /**
   * Use .js extensions in client SDK imports (rarely needed)
   * @default false
   */
  ${getFieldLine("useJsExtensionsClient", existingFields, mergeStrategy, 'false', userChoices)}
  
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

  return template;
}

function getFieldValue(
  key: string,
  existingFields: ConfigField[],
  mergeStrategy: "keep-existing" | "use-defaults" | "interactive",
  userChoices?: Map<string, any>
): string {
  const existing = existingFields.find(f => f.key === key);
  
  if (mergeStrategy === "keep-existing" && existing && !existing.isCommented) {
    // Clean up the value - remove trailing comma if present
    const value = existing.value.toString().replace(/,\s*$/, '');
    return value;
  }
  
  if (mergeStrategy === "interactive" && userChoices?.has(key)) {
    return userChoices.get(key);
  }
  
  // Default value for connectionString
  return 'process.env.DATABASE_URL || "postgres://user:password@localhost:5432/mydb"';
}

function getFieldLine(
  key: string,
  existingFields: ConfigField[],
  mergeStrategy: "keep-existing" | "use-defaults" | "interactive",
  defaultValue: string,
  userChoices?: Map<string, any>
): string {
  const existing = existingFields.find(f => f.key === key);
  
  const shouldUseExisting = 
    (mergeStrategy === "keep-existing" && existing && !existing.isCommented) ||
    (mergeStrategy === "interactive" && userChoices?.get(key) === "keep");
  
  const shouldUseNew = 
    (mergeStrategy === "use-defaults") ||
    (mergeStrategy === "interactive" && userChoices?.get(key) === "new");
  
  if (shouldUseExisting && existing) {
    const value = typeof existing.value === "string" && !existing.value.startsWith('"') 
      ? `"${existing.value}"`
      : existing.value;
    return `${key}: ${value},`;
  }
  
  if (shouldUseNew) {
    return `${key}: ${defaultValue},`;
  }
  
  // Comment out by default
  return `// ${key}: ${defaultValue},`;
}