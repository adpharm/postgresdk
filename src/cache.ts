import { createHash } from "crypto";
import { readFile, writeFile, mkdir, appendFile } from "fs/promises";
import { existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import type { Model } from "./introspect";
import type { Config } from "./types";

// Get package version for cache invalidation
const packageJson = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf-8"));
const POSTGRESDK_VERSION = packageJson.version as string;

export interface CacheData {
  schemaHash: string;
  lastRun: string;
  filesGenerated: number;
  config: {
    outDir: string | { server: string; client: string };
    schema: string;
  };
}

/**
 * Compute a deterministic hash of the schema and config
 * Includes postgresdk version to trigger regeneration on upgrades
 */
export function computeSchemaHash(model: Model, config: Config): string {
  // Serialize the parts that affect code generation
  const payload = {
    version: POSTGRESDK_VERSION, // Include package version for cache invalidation on upgrades
    schema: model.schema,
    tables: model.tables,
    enums: model.enums,
    config: {
      outDir: config.outDir,
      schema: config.schema,
      softDeleteColumn: config.softDeleteColumn,
      includeMethodsDepth: config.includeMethodsDepth,
      serverFramework: config.serverFramework,
      useJsExtensions: config.useJsExtensions,
      useJsExtensionsClient: config.useJsExtensionsClient,
      numericMode: config.numericMode,
      skipJunctionTables: config.skipJunctionTables,
      apiPathPrefix: config.apiPathPrefix,
      auth: config.auth,
      tests: config.tests,
    },
  };

  const json = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(json).digest("hex");
}

/**
 * Get the cache directory path
 */
export function getCacheDir(baseDir: string = process.cwd()): string {
  return join(baseDir, ".postgresdk");
}

/**
 * Ensure .postgresdk/ is in .gitignore
 */
async function ensureGitignore(baseDir: string = process.cwd()): Promise<void> {
  const gitignorePath = join(baseDir, ".gitignore");

  // Only add if .gitignore exists (don't create it if it doesn't)
  if (!existsSync(gitignorePath)) {
    return;
  }

  try {
    const content = await readFile(gitignorePath, "utf-8");

    // Check if already ignored
    if (content.includes(".postgresdk")) {
      return;
    }

    // Add to gitignore
    const entry = "\n# PostgreSDK cache and history\n.postgresdk/\n";
    await appendFile(gitignorePath, entry);
    console.log("✓ Added .postgresdk/ to .gitignore");
  } catch {
    // Ignore errors - not critical
  }
}

/**
 * Read cache data if it exists
 */
export async function readCache(baseDir?: string): Promise<CacheData | null> {
  const cachePath = join(getCacheDir(baseDir), "cache.json");

  if (!existsSync(cachePath)) {
    return null;
  }

  try {
    const content = await readFile(cachePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write cache data
 */
export async function writeCache(data: CacheData, baseDir?: string): Promise<void> {
  const cacheDir = getCacheDir(baseDir);
  const isNewCache = !existsSync(cacheDir);

  await mkdir(cacheDir, { recursive: true });

  // Add to gitignore if this is the first time creating the cache
  if (isNewCache) {
    await ensureGitignore(baseDir);
  }

  const cachePath = join(cacheDir, "cache.json");
  await writeFile(cachePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Append an entry to the history log
 */
export async function appendToHistory(entry: string, baseDir?: string): Promise<void> {
  const cacheDir = getCacheDir(baseDir);
  const isNewCache = !existsSync(cacheDir);

  await mkdir(cacheDir, { recursive: true });

  // Add to gitignore if this is the first time creating the cache
  if (isNewCache) {
    await ensureGitignore(baseDir);
  }

  const historyPath = join(cacheDir, "history.md");
  const timestamp = new Date().toISOString().replace("T", " ").substring(0, 19);
  const formattedEntry = `## ${timestamp} - ${entry}\n\n`;

  // Append to file
  try {
    const existing = existsSync(historyPath)
      ? await readFile(historyPath, "utf-8")
      : "# PostgreSDK Generation History\n\n";
    await writeFile(historyPath, existing + formattedEntry, "utf-8");
  } catch {
    // If file doesn't exist or can't be read, create new
    await writeFile(historyPath, `# PostgreSDK Generation History\n\n${formattedEntry}`, "utf-8");
  }
}
