#!/usr/bin/env bun
/**
 * Tests the writeFilesIfChanged utility function
 *
 * This test verifies that:
 * 1. New files are written
 * 2. Unchanged files are skipped (not touched)
 * 3. Changed files are updated
 * 4. Correct counts are returned
 */

import { existsSync, rmSync, statSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";
import { writeFilesIfChanged, deleteStaleFiles } from "../src/utils";

const TEST_DIR = "test/.test-write-files-if-changed";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function cleanup() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function testWriteNewFiles() {
  console.log("\n📝 Test 1: Write new files");

  const files = [
    { path: join(TEST_DIR, "file1.txt"), content: "hello world" },
    { path: join(TEST_DIR, "file2.txt"), content: "foo bar" },
  ];

  const result = await writeFilesIfChanged(files);

  assert(result.written === 2, `Expected 2 files written, got ${result.written}`);
  assert(result.unchanged === 0, `Expected 0 unchanged, got ${result.unchanged}`);
  assert(result.filesWritten.length === 2, `Expected 2 files in filesWritten array`);
  assert(existsSync(files[0]!.path), "file1.txt should exist");
  assert(existsSync(files[1]!.path), "file2.txt should exist");

  const content1 = await readFile(files[0]!.path, "utf-8");
  const content2 = await readFile(files[1]!.path, "utf-8");
  assert(content1 === "hello world", "file1.txt should have correct content");
  assert(content2 === "foo bar", "file2.txt should have correct content");

  console.log("  ✓ New files written correctly");
}

async function testSkipUnchangedFiles() {
  console.log("\n📝 Test 2: Skip unchanged files");

  const files = [
    { path: join(TEST_DIR, "file1.txt"), content: "hello world" },
    { path: join(TEST_DIR, "file2.txt"), content: "foo bar" },
  ];

  // Get original modification times
  const mtime1Before = statSync(files[0]!.path).mtimeMs;
  const mtime2Before = statSync(files[1]!.path).mtimeMs;

  // Wait a bit to ensure mtime would change if file is written
  await new Promise(resolve => setTimeout(resolve, 10));

  const result = await writeFilesIfChanged(files);

  assert(result.written === 0, `Expected 0 files written, got ${result.written}`);
  assert(result.unchanged === 2, `Expected 2 unchanged, got ${result.unchanged}`);
  assert(result.filesWritten.length === 0, `Expected 0 files in filesWritten array`);

  // Verify files weren't touched
  const mtime1After = statSync(files[0]!.path).mtimeMs;
  const mtime2After = statSync(files[1]!.path).mtimeMs;
  assert(mtime1Before === mtime1After, "file1.txt should not be touched");
  assert(mtime2Before === mtime2After, "file2.txt should not be touched");

  console.log("  ✓ Unchanged files skipped correctly");
}

async function testUpdateChangedFiles() {
  console.log("\n📝 Test 3: Update only changed files");

  const files = [
    { path: join(TEST_DIR, "file1.txt"), content: "changed content" },
    { path: join(TEST_DIR, "file2.txt"), content: "foo bar" }, // unchanged
  ];

  const result = await writeFilesIfChanged(files);

  assert(result.written === 1, `Expected 1 file written, got ${result.written}`);
  assert(result.unchanged === 1, `Expected 1 unchanged, got ${result.unchanged}`);
  assert(result.filesWritten.length === 1, `Expected 1 file in filesWritten array`);
  assert(result.filesWritten[0]! === files[0]!.path, "filesWritten should contain file1.txt");

  const content1 = await readFile(files[0]!.path, "utf-8");
  const content2 = await readFile(files[1]!.path, "utf-8");
  assert(content1 === "changed content", "file1.txt should have updated content");
  assert(content2 === "foo bar", "file2.txt should remain unchanged");

  console.log("  ✓ Changed files updated correctly");
}

async function testNestedDirectories() {
  console.log("\n📝 Test 4: Handle nested directories");

  const files = [
    { path: join(TEST_DIR, "nested", "deep", "file3.txt"), content: "nested content" },
  ];

  const result = await writeFilesIfChanged(files);

  assert(result.written === 1, `Expected 1 file written, got ${result.written}`);
  assert(existsSync(files[0]!.path), "Nested file should exist");

  const content = await readFile(files[0]!.path, "utf-8");
  assert(content === "nested content", "Nested file should have correct content");

  console.log("  ✓ Nested directories handled correctly");
}

async function testDeleteStaleFiles() {
  console.log("\n📝 Test 5: Delete stale files");

  const dir = join(TEST_DIR, "stale-test");

  // Write some files directly (simulating previously generated files)
  const staleFile = join(dir, "stale-table.ts");
  const keptFile = join(dir, "kept-table.ts");
  await writeFilesIfChanged([
    { path: staleFile, content: "stale content" },
    { path: keptFile, content: "kept content" },
  ]);

  assert(existsSync(staleFile), "stale file should exist before cleanup");
  assert(existsSync(keptFile), "kept file should exist before cleanup");

  // Only keptFile is in the generated set
  const result = await deleteStaleFiles(new Set([keptFile]), [dir]);

  assert(result.deleted === 1, `Expected 1 deleted, got ${result.deleted}`);
  assert(result.filesDeleted[0] === staleFile, "filesDeleted should contain stale file");
  assert(!existsSync(staleFile), "stale file should be deleted");
  assert(existsSync(keptFile), "kept file should still exist");

  console.log("  ✓ Stale files deleted correctly");
}

async function testDeleteStaleFilesNonExistentDir() {
  console.log("\n📝 Test 6: Skip non-existent dirs gracefully");

  const result = await deleteStaleFiles(new Set(), [join(TEST_DIR, "does-not-exist")]);

  assert(result.deleted === 0, `Expected 0 deleted, got ${result.deleted}`);

  console.log("  ✓ Non-existent dirs handled gracefully");
}

async function testDeleteStaleFilesPreservesNonManagedExtensions() {
  console.log("\n📝 Test 7: Preserve files with unmanaged extensions");

  const dir = join(TEST_DIR, "ext-test");
  const jsonFile = join(dir, "data.json");
  const tsFile = join(dir, "stale.ts");

  await writeFilesIfChanged([
    { path: jsonFile, content: "{}" },
    { path: tsFile, content: "export {}" },
  ]);

  // Neither file is in generated set, but only .ts should be deleted
  const result = await deleteStaleFiles(new Set(), [dir]);

  assert(result.deleted === 1, `Expected 1 deleted, got ${result.deleted}`);
  assert(!existsSync(tsFile), "stale .ts file should be deleted");
  assert(existsSync(jsonFile), ".json file should be preserved");

  console.log("  ✓ Non-managed extensions preserved");
}

async function main() {
  console.log("🧪 Testing writeFilesIfChanged utility");
  console.log("=".repeat(50));

  try {
    await cleanup();
    await testWriteNewFiles();
    await testSkipUnchangedFiles();
    await testUpdateChangedFiles();
    await testNestedDirectories();
    await testDeleteStaleFiles();
    await testDeleteStaleFilesNonExistentDir();
    await testDeleteStaleFilesPreservesNonManagedExtensions();
    await cleanup();

    console.log("\n" + "=".repeat(50));
    console.log("✅ All writeFilesIfChanged tests passed!");
    console.log("=".repeat(50));
    console.log("\nVerified:");
    console.log("  • New files are written");
    console.log("  • Unchanged files are skipped (not touched)");
    console.log("  • Changed files are updated");
    console.log("  • Correct counts are returned");
    console.log("  • Nested directories are handled");
    console.log("  • Stale files are deleted");
    console.log("  • Non-existent dirs are handled gracefully");
    console.log("  • Non-managed file extensions are preserved");
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    await cleanup();
    process.exit(1);
  }
}

main();
