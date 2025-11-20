import { writeFile, mkdir } from "fs/promises";
import { join, dirname, resolve } from "path";
import { existsSync } from "fs";
import { pathToFileURL } from "url";

interface PullConfig {
  from?: string;
  output?: string;
  token?: string;
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
    token: args.find(a => a.startsWith("--token="))?.split("=")[1],
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
    console.error("❌ Missing API URL. Specify via --from or in postgresdk.config.ts");
    console.error("\nExample config file:");
    console.error(`export default {
  pull: {
    from: "https://api.company.com",
    output: "./src/sdk"
  }
}`);
    process.exit(1);
  }
  
  // 6. Execute pull
  console.log(`🔄 Pulling SDK from ${config.from}`);
  console.log(`📁 Output directory: ${config.output}`);
  
  try {
    // Fetch manifest first
    const headers: Record<string, string> = config.token 
      ? { Authorization: `Bearer ${config.token}` } 
      : {};
    
    const manifestRes = await fetch(`${config.from}/_psdk/sdk/manifest`, { headers });
    
    if (!manifestRes.ok) {
      throw new Error(`Failed to fetch SDK manifest: ${manifestRes.status} ${manifestRes.statusText}`);
    }
    
    const manifest = await manifestRes.json() as { version: string; generated: string; files: string[] };
    console.log(`📦 SDK version: ${manifest.version}`);
    console.log(`📅 Generated: ${manifest.generated}`);
    console.log(`📄 Files: ${manifest.files.length}`);
    
    // Fetch full SDK
    const sdkRes = await fetch(`${config.from}/_psdk/sdk/download`, { headers });
    
    if (!sdkRes.ok) {
      throw new Error(`Failed to download SDK: ${sdkRes.status} ${sdkRes.statusText}`);
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