import { writeFile, mkdir, readFile } from "fs/promises";
import { join, dirname, resolve } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";
import { appendToHistory } from "./cache";

interface PullConfig {
  from?: string;
  output?: string;
  pullToken?: string;
}

export async function pullCommand(args: string[]) {
  // 1. Check for config file path from CLI
  let configPath = "postgresdk.config.ts";
  const configIndex = args.findIndex(a => a === "-c" || a === "--config");
  if (configIndex !== -1 && args[configIndex + 1]) {
    configPath = args[configIndex + 1]!;
  }
  
  // 2. Load config file if it exists
  let fileConfig: PullConfig = {};
  const fullConfigPath = resolve(process.cwd(), configPath);
  
  if (existsSync(fullConfigPath)) {
    console.log(`📋 Loading ${configPath}`);
    try {
      const configUrl = pathToFileURL(fullConfigPath).href;
      const module = await import(configUrl);
      const config = module.default || module;
      
      // Check if this is a pull config or has pull settings
      if (config.pull) {
        fileConfig = config.pull;
      }
    } catch (err) {
      console.error("⚠️  Failed to load config file:", err);
    }
  }
  
  // 3. Parse CLI arguments
  const cliConfig: PullConfig = {
    from: args.find(a => a.startsWith("--from="))?.split("=")[1],
    output: args.find(a => a.startsWith("--output="))?.split("=")[1],
    pullToken: args.find(a => a.startsWith("--pullToken="))?.split("=")[1],
  };
  
  // 4. Merge configs (CLI overrides file)
  const config: PullConfig = {
    output: "./src/sdk",  // Default
    ...fileConfig,        // File config
    ...Object.fromEntries(  // CLI overrides (only non-undefined values)
      Object.entries(cliConfig).filter(([_, v]) => v !== undefined)
    )
  };
  
  // 5. Validate required fields
  if (!config.from) {
    console.error("❌ Missing API URL");
    console.error("\nOptions:");
    console.error("  1. Use CLI args:    npx postgresdk@latest pull --from=https://api.company.com --output=./src/sdk");
    console.error("  2. Create config:   npx postgresdk@latest init pull");
    console.error("                      (then edit postgresdk.config.ts and run 'postgresdk pull')");
    process.exit(1);
  }
  
  // 6. Resolve pullToken (support "env:VAR_NAME" syntax)
  let resolvedToken: string | undefined = config.pullToken;
  if (resolvedToken?.startsWith("env:")) {
    const envVarName = resolvedToken.slice(4); // Remove "env:" prefix
    resolvedToken = process.env[envVarName];
    if (!resolvedToken) {
      console.error(`❌ Environment variable "${envVarName}" not set (referenced in pullToken config)`);
      process.exit(1);
    }
  }

  // 7. Execute pull
  console.log(`🔄 Pulling SDK from ${config.from}`);
  console.log(`📁 Output directory: ${config.output}`);

  try {
    // Fetch manifest first
    const headers: Record<string, string> = resolvedToken
      ? { Authorization: `Bearer ${resolvedToken}` }
      : {};
    
    const manifestRes = await fetch(`${config.from}/_psdk/sdk/manifest`, { headers });

    if (!manifestRes.ok) {
      let errorMsg = `${manifestRes.status} ${manifestRes.statusText}`;
      try {
        const errorBody = await manifestRes.json() as { error?: string };
        if (errorBody.error) {
          errorMsg = errorBody.error;
        }
      } catch {
        // Failed to parse error body, use status text
      }
      throw new Error(`Failed to fetch SDK manifest: ${errorMsg}`);
    }
    
    const manifest = await manifestRes.json() as { version: string; files: string[] };
    console.log(`📦 SDK version: ${manifest.version}`);
    console.log(`📄 Files: ${manifest.files.length}`);
    
    // Fetch full SDK
    const sdkRes = await fetch(`${config.from}/_psdk/sdk/download`, { headers });

    if (!sdkRes.ok) {
      let errorMsg = `${sdkRes.status} ${sdkRes.statusText}`;
      try {
        const errorBody = await sdkRes.json() as { error?: string };
        if (errorBody.error) {
          errorMsg = errorBody.error;
        }
      } catch {
        // Failed to parse error body, use status text
      }
      throw new Error(`Failed to download SDK: ${errorMsg}`);
    }
    
    const sdk = await sdkRes.json() as { files: Record<string, string>; version: string; generated?: string };

    // Write files only if changed
    let filesWritten = 0;
    let filesUnchanged = 0;
    const changedFiles: string[] = [];

    for (const [path, content] of Object.entries(sdk.files)) {
      const fullPath = join(config.output!, path);
      await mkdir(dirname(fullPath), { recursive: true });

      // Check if file exists and content is the same
      let shouldWrite = true;
      if (existsSync(fullPath)) {
        const existing = await readFile(fullPath, "utf-8");
        if (existing === content) {
          shouldWrite = false;
          filesUnchanged++;
        }
      }

      if (shouldWrite) {
        await writeFile(fullPath, content, "utf-8");
        filesWritten++;
        changedFiles.push(path);
        console.log(`  ✓ ${path}`);
      }
    }

    // Write metadata file (without timestamp for idempotency)
    const metadataPath = join(config.output!, ".postgresdk.json");
    const metadata = {
      version: sdk.version,
      pulledFrom: config.from,
    };

    // Only write metadata if it changed
    let metadataChanged = true;
    if (existsSync(metadataPath)) {
      const existing = await readFile(metadataPath, "utf-8");
      if (existing === JSON.stringify(metadata, null, 2)) {
        metadataChanged = false;
      }
    }

    if (metadataChanged) {
      await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

    // Log results
    if (filesWritten === 0 && !metadataChanged) {
      console.log(`✅ SDK up-to-date (${filesUnchanged} files unchanged)`);
      await appendToHistory(
        `Pull\n✅ SDK up-to-date\n- Pulled from: ${config.from}\n- Files checked: ${filesUnchanged}`
      );
    } else {
      console.log(`✅ SDK pulled successfully to ${config.output}`);
      console.log(`   Updated: ${filesWritten} files, Unchanged: ${filesUnchanged} files`);

      let logEntry = `Pull\n✅ Updated ${filesWritten} files from ${config.from}\n- SDK version: ${sdk.version}\n- Files unchanged: ${filesUnchanged}`;
      if (changedFiles.length > 0 && changedFiles.length <= 10) {
        logEntry += `\n- Modified: ${changedFiles.join(", ")}`;
      } else if (changedFiles.length > 10) {
        logEntry += `\n- Modified: ${changedFiles.slice(0, 10).join(", ")} and ${changedFiles.length - 10} more...`;
      }

      await appendToHistory(logEntry);
    }
  } catch (err) {
    console.error(`❌ Pull failed:`, err);
    process.exit(1);
  }
}