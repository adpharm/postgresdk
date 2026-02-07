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
import { writeFilesIfChanged } from "../src/utils";

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
  assert(existsSync(files[0].path), "file1.txt should exist");
  assert(existsSync(files[1].path), "file2.txt should exist");

  const content1 = await readFile(files[0].path, "utf-8");
  const content2 = await readFile(files[1].path, "utf-8");
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
  const mtime1Before = statSync(files[0].path).mtimeMs;
  const mtime2Before = statSync(files[1].path).mtimeMs;

  // Wait a bit to ensure mtime would change if file is written
  await new Promise(resolve => setTimeout(resolve, 10));

  const result = await writeFilesIfChanged(files);

  assert(result.written === 0, `Expected 0 files written, got ${result.written}`);
  assert(result.unchanged === 2, `Expected 2 unchanged, got ${result.unchanged}`);
  assert(result.filesWritten.length === 0, `Expected 0 files in filesWritten array`);

  // Verify files weren't touched
  const mtime1After = statSync(files[0].path).mtimeMs;
  const mtime2After = statSync(files[1].path).mtimeMs;
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
  assert(result.filesWritten[0] === files[0].path, "filesWritten should contain file1.txt");

  const content1 = await readFile(files[0].path, "utf-8");
  const content2 = await readFile(files[1].path, "utf-8");
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
  assert(existsSync(files[0].path), "Nested file should exist");

  const content = await readFile(files[0].path, "utf-8");
  assert(content === "nested content", "Nested file should have correct content");

  console.log("  ✓ Nested directories handled correctly");
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
  } catch (err) {
    console.error("\n❌ Test failed:", err);
    await cleanup();
    process.exit(1);
  }
}

main();
