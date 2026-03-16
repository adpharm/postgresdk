import { unlink } from "fs/promises";
import prompts from "prompts";

/** Parse --force / -y / --yes from CLI args */
export function parseForceFlag(args: string[]): boolean {
  return args.includes("--force") || args.includes("-y") || args.includes("--yes");
}

/**
 * For each stale file, prompt the user to confirm deletion (shadcn-style per-file).
 * If `force` is true, all files are deleted without prompting.
 * If stdout is not a TTY (e.g. CI), files are skipped with a warning unless `force` is true.
 *
 * Returns counts of deleted and skipped files.
 */
export async function confirmAndDeleteStaleFiles(
  staleFiles: string[],
  force: boolean
): Promise<{ deleted: number; skipped: number; filesDeleted: string[] }> {
  if (staleFiles.length === 0) return { deleted: 0, skipped: 0, filesDeleted: [] };

  if (!force && !process.stdout.isTTY) {
    console.log(`⚠️  ${staleFiles.length} stale file(s) not deleted (non-interactive shell). Re-run with --force to delete.`);
    return { deleted: 0, skipped: staleFiles.length, filesDeleted: [] };
  }

  let deleted = 0;
  let skipped = 0;
  const filesDeleted: string[] = [];

  for (const filePath of staleFiles) {
    let shouldDelete = force;

    if (!force) {
      const { confirmed } = await prompts({
        type: "confirm",
        name: "confirmed",
        message: `Delete stale file: ${filePath}?`,
        initial: false,
      });

      // If the user ctrl-c'd out of the prompt, confirmed is undefined
      if (confirmed === undefined) {
        console.log("Stale file deletion aborted.");
        break;
      }

      shouldDelete = confirmed;
    }

    if (shouldDelete) {
      await unlink(filePath);
      console.log(`  ✗ ${filePath}`);
      filesDeleted.push(filePath);
      deleted++;
    } else {
      skipped++;
    }
  }

  return { deleted, skipped, filesDeleted };
}
