export interface AuthConfig {
  apiKeyHeader?: string;
  apiKeys?: string[]; // can include "env:MY_KEY_LIST"
  jwt?: {
    services: Array<{
      issuer: string;    // Required - identifies the service (must match JWT 'iss' claim)
      secret: string;    // Required - MUST use "env:VAR_NAME" format (e.g., "env:JWT_SECRET")
                         // ⚠️ SECURITY: Never use process.env.X or hardcoded strings in config!
                         // Generator converts "env:JWT_SECRET" → process.env.JWT_SECRET in generated code
    }>;
    audience?: string;    // Optional - validates 'aud' claim
  };
}

// Helper to infer auth strategy from config
export function getAuthStrategy(auth: AuthConfig | undefined): "none" | "api-key" | "jwt-hs256" {
  if (!auth) return "none";
  if (auth.jwt) return "jwt-hs256";
  if (auth.apiKeys && auth.apiKeys.length > 0) return "api-key";
  return "none";
}

// Simplified auth syntax support
export type AuthConfigInput = AuthConfig | {
  // Shorthand for API key auth
  apiKey?: string;
  apiKeys?: string[];
  apiKeyHeader?: string;
}

export interface Config {
  // Required
  connectionString: string;

  // Optional
  schema?: string;
  outDir?: string | { client: string; server: string };
  softDeleteColumn?: string | null;
  dateType?: "date" | "string";
  
  // Include methods generation
  includeMethodsDepth?: number;  // How deep to generate include methods (default: 2)
  skipJunctionTables?: boolean;  // Skip junction tables in include methods (default: true)
  
  // Server framework for generated routes
  serverFramework?: "hono" | "express" | "fastify";

  // API path prefix for table routes (default: "/v1")
  apiPathPrefix?: string;

  // Auth
  auth?: AuthConfigInput;

  // Pull token for protecting /_psdk/* endpoints (optional - if not set, endpoints are public)
  // Use "env:VAR_NAME" syntax to read from environment variables
  pullToken?: string;

  // Pull configuration (for client repos)
  pull?: PullConfig;
  
  // Use .js extensions in server imports (for Vercel Edge compatibility)
  useJsExtensions?: boolean;
  
  // Use .js extensions in client SDK imports (for specific bundlers/environments)
  useJsExtensionsClient?: boolean;
  
  // Test generation configuration
  tests?: {
    // Generate test files
    generate?: boolean;
    // Output directory for tests (default: "./api/tests")
    output?: string;
    // Test framework to use
    framework?: "vitest" | "jest" | "bun";
  };
}

export interface PullConfig {
  from: string;           // API URL to pull from
  output?: string;        // Output directory (default: ./src/sdk)
  pullToken?: string;     // Auth token for /_psdk/* endpoints (use "env:VAR_NAME" syntax)
}

// Normalize simplified auth syntax to full AuthConfig
export function normalizeAuthConfig(input: AuthConfigInput | undefined): AuthConfig | undefined {
  if (!input) return undefined;

  // If it already looks like a full AuthConfig (has jwt or apiKeys), return as-is
  if ('jwt' in input || 'apiKeys' in input) {
    return input as AuthConfig;
  }

  // Handle shorthand syntax
  if ('apiKey' in input && input.apiKey) {
    return {
      apiKeyHeader: input.apiKeyHeader,
      apiKeys: [input.apiKey, ...(input.apiKeys || [])]
    };
  }

  // No recognizable auth config
  return undefined;
}