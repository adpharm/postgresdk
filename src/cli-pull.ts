import { writeFile, mkdir } from "fs/promises";
import { join, dirname, resolve } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";

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
    
    const manifest = await manifestRes.json() as { version: string; generated: string; files: string[] };
    console.log(`📦 SDK version: ${manifest.version}`);
    console.log(`📅 Generated: ${manifest.generated}`);
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
    
    const sdk = await sdkRes.json() as { files: Record<string, string>; version: string; generated: string };
    
    // Write all files
    for (const [path, content] of Object.entries(sdk.files)) {
      const fullPath = join(config.output!, path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, "utf-8");
      console.log(`  ✓ ${path}`);
    }
    
    // Write metadata file
    await writeFile(
      join(config.output!, ".postgresdk.json"),
      JSON.stringify({
        version: sdk.version,
        generated: sdk.generated,
        pulledFrom: config.from,
        pulledAt: new Date().toISOString()
      }, null, 2)
    );
    
    console.log(`✅ SDK pulled successfully to ${config.output}`);
  } catch (err) {
    console.error(`❌ Pull failed:`, err);
    process.exit(1);
  }
}