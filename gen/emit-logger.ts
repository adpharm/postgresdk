/* Emits a tiny logger used by generated server routes. */
export function emitLogger() {
  return `/* Generated. Do not edit. */
const DEBUG = process.env.SDK_DEBUG === "1" || process.env.SDK_DEBUG === "true";

export const logger = {
  debug: (...args: any[]) => { if (DEBUG) console.debug("[sdk:debug]", ...args); },
  info:  (...args: any[]) => { if (DEBUG) console.info ("[sdk:info ]", ...args); },
  warn:  (...args: any[]) => {           console.warn ("[sdk:warn ]", ...args); },
  error: (...args: any[]) => {           console.error("[sdk:error]", ...args); },
};

export function safe<T extends (c: any) => any>(handler: T) {
  return async (c: any) => {
    try {
      const res = await handler(c);
      // If a handler returns a Response with 5xx, log the body in debug
      if (typeof res?.status === "number" && res.status >= 500) {
        try {
          const clone = res.clone?.();
          const text = clone ? await clone.text() : "";
          logger.error(\`5xx response: \${c.req.method} \${c.req.path}\`, text);
        } catch {}
      }
      return res;
    } catch (e: any) {
      logger.error(\`Unhandled error in \${c.req.method} \${c.req.path}\`, e?.stack ?? e);
      const body = { error: e?.message ?? "Internal error", ...(process.env.SDK_DEBUG ? { stack: e?.stack } : {}) };
      return c.json(body, 500);
    }
  };
}
`;
}
