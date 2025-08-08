export interface AuthConfig {
  strategy?: "none" | "api-key" | "jwt-hs256";
  apiKeyHeader?: string;
  apiKeys?: string[]; // can include "env:MY_KEY_LIST"
  jwt?: {
    sharedSecret?: string; // can be "env:JWT_SHARED_SECRET"
    issuer?: string;
    audience?: string;
  };
}

// Simplified auth syntax support
export type AuthConfigInput = AuthConfig | {
  // Shorthand for API key auth
  apiKey?: string;
  apiKeys?: string[];
  apiKeyHeader?: string;
  
  // Shorthand for JWT auth
  jwt?: string | {
    sharedSecret?: string;
    issuer?: string;
    audience?: string;
  };
}

export interface Config {
  // Required
  connectionString: string;
  
  // Optional
  schema?: string;
  outServer?: string;
  outClient?: string;
  softDeleteColumn?: string | null;
  includeDepthLimit?: number;
  dateType?: "date" | "string";
  
  // Auth
  auth?: AuthConfigInput;
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
    if (typeof input.jwt === 'string') {
      return {
        strategy: "jwt-hs256",
        jwt: { sharedSecret: input.jwt }
      };
    } else {
      return {
        strategy: "jwt-hs256",
        jwt: input.jwt
      };
    }
  }
  
  // Default to no auth if no recognizable auth config
  return { strategy: "none" };
}