export interface AuthConfig {
  strategy?: "none" | "api-key" | "jwt-hs256";
  apiKeyHeader?: string;
  apiKeys?: string[]; // can include "env:MY_KEY_LIST"
  jwt?: {
    services: Array<{
      issuer: string;    // Required - identifies the service
      secret: string;     // Required - that service's signing secret (can be "env:VAR_NAME")
    }>;
    audience?: string;    // Optional - validates 'aud' claim
  };
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
  token?: string;         // Auth token if needed
}

// Normalize simplified auth syntax to full AuthConfig
export function normalizeAuthConfig(input: AuthConfigInput | undefined): AuthConfig | undefined {
  if (!input) return undefined;
  
  // If it already has a strategy, assume it's a full AuthConfig
  if ('strategy' in input && input.strategy) {
    return input as AuthConfig;
  }
  
  // Handle shorthand syntax
  if ('apiKey' in input && input.apiKey) {
    return {
      strategy: "api-key",
      apiKeyHeader: input.apiKeyHeader,
      apiKeys: [input.apiKey, ...(input.apiKeys || [])]
    };
  }
  
  if ('apiKeys' in input && input.apiKeys?.length) {
    return {
      strategy: "api-key",
      apiKeyHeader: input.apiKeyHeader,
      apiKeys: input.apiKeys
    };
  }
  
  if ('jwt' in input && input.jwt) {
    return {
      strategy: "jwt-hs256",
      jwt: input.jwt
    };
  }
  
  // Default to no auth if no recognizable auth config
  return { strategy: "none" };
}