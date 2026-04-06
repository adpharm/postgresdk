import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseForceFlag } from "./cli-utils";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Install the PostgreSDK Claude Code skill into the current project.
 * Copies skills/postgresdk/SKILL.md → .claude/skills/postgresdk/SKILL.md
 */
export async function installSkillCommand(args: string[]): Promise<void> {
  const force = parseForceFlag(args);
  const destDir = join(process.cwd(), ".claude", "skills", "postgresdk");
  const destPath = join(destDir, "SKILL.md");

  // Check if skill already exists
  if (existsSync(destPath) && !force) {
    console.log("⚠️  Skill already exists at .claude/skills/postgresdk/SKILL.md");
    console.log("   Use --force to overwrite.");
    return;
  }

  // Read the bundled skill
  const srcPath = join(__dirname, "..", "skills", "postgresdk", "SKILL.md");
  if (!existsSync(srcPath)) {
    console.error("❌ Could not find bundled skill file. This is a bug — please report it.");
    process.exit(1);
  }

  const content = readFileSync(srcPath, "utf-8");

  // Write to project
  mkdirSync(destDir, { recursive: true });
  writeFileSync(destPath, content, "utf-8");

  console.log("✅ Installed PostgreSDK skill to .claude/skills/postgresdk/SKILL.md");
  console.log("");
  console.log("   Claude Code will now use this skill when you ask about your");
  console.log("   generated API or SDK. Try asking it to help with queries,");
  console.log("   filtering, includes, auth setup, or transactions.");
}
