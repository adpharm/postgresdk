/**
 * Emits the BaseClient class that all table-specific clients will extend.
 * Contains all shared logic for auth, headers, and HTTP operations.
 */
export function emitBaseClient() {
  return `/* Generated. Do not edit. */

export type HeaderMap = Record<string, string>;
export type AuthHeadersProvider = () => Promise<HeaderMap> | HeaderMap;

export type AuthConfig =
  | AuthHeadersProvider
  | {
      apiKey?: string;
      /** defaults to "x-api-key" */
      apiKeyHeader?: string;
      /** static token or async provider returning a token */
      jwt?: string | (() => Promise<string>);
      /** extra headers, static or async */
      headers?: AuthHeadersProvider;
    };

/**
 * Base client class with shared authentication and request handling logic.
 * All table-specific clients extend this class.
 */
export abstract class BaseClient {
  constructor(
    protected baseUrl: string,
    protected fetchFn: typeof fetch = fetch,
    protected auth?: AuthConfig
  ) {}

  protected async authHeaders(): Promise<HeaderMap> {
    if (!this.auth) return {};
    if (typeof this.auth === "function") {
      const h = await this.auth();
      return h ?? {};
    }
    const out: HeaderMap = {};

    if (this.auth.apiKey) {
      const header = this.auth.apiKeyHeader ?? "x-api-key";
      out[header] = this.auth.apiKey;
    }

    if (this.auth.jwt) {
      const token = typeof this.auth.jwt === "function" ? await this.auth.jwt() : this.auth.jwt;
      if (token) out["authorization"] = \`Bearer \${token}\`;
    }

    if (this.auth.headers) {
      const extra = typeof this.auth.headers === "function" ? await this.auth.headers() : this.auth.headers;
      Object.assign(out, extra ?? {});
    }

    return out;
  }

  protected async headers(json = false): Promise<HeaderMap> {
    const extra = await this.authHeaders();
    return json ? { "Content-Type": "application/json", ...extra } : extra;
  }

  protected async okOrThrow(res: Response, action: string, entity: string): Promise<void> {
    if (!res.ok) {
      let detail = "";
      try { detail = await res.text(); } catch {}
      throw new Error(\`\${action} \${entity} failed: \${res.status} \${detail}\`);
    }
  }

  /**
   * Make a POST request
   */
  protected async post<T>(path: string, body?: any): Promise<T> {
    const res = await this.fetchFn(\`\${this.baseUrl}\${path}\`, {
      method: "POST",
      headers: await this.headers(true),
      body: JSON.stringify(body),
    });
    
    // Handle 404 specially for operations that might return null
    if (res.status === 404) {
      return null as T;
    }
    
    await this.okOrThrow(res, "POST", path);
    return (await res.json()) as T;
  }

  /**
   * Make a GET request
   */
  protected async get<T>(path: string): Promise<T> {
    const res = await this.fetchFn(\`\${this.baseUrl}\${path}\`, {
      headers: await this.headers(),
    });
    
    if (res.status === 404) {
      return null as T;
    }
    
    await this.okOrThrow(res, "GET", path);
    return (await res.json()) as T;
  }

  /**
   * Make a PATCH request
   */
  protected async patch<T>(path: string, body?: any): Promise<T> {
    const res = await this.fetchFn(\`\${this.baseUrl}\${path}\`, {
      method: "PATCH",
      headers: await this.headers(true),
      body: JSON.stringify(body),
    });
    
    if (res.status === 404) {
      return null as T;
    }
    
    await this.okOrThrow(res, "PATCH", path);
    return (await res.json()) as T;
  }

  /**
   * Make a DELETE request
   */
  protected async del<T>(path: string): Promise<T> {
    const res = await this.fetchFn(\`\${this.baseUrl}\${path}\`, {
      method: "DELETE",
      headers: await this.headers(),
    });
    
    if (res.status === 404) {
      return null as T;
    }
    
    await this.okOrThrow(res, "DELETE", path);
    return (await res.json()) as T;
  }
}
`;
}