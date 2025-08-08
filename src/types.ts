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
  auth?: AuthConfig;
}