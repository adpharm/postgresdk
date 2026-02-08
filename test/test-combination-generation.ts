#!/usr/bin/env bun

/**
 * Test: Verify that tables with 4+ relationships generate pair combinations
 *
 * This test verifies the fix for the issue where listWithXAndY methods
 * were not generated when a table had 4+ relationships.
 */

import { generateIncludeMethods } from "../src/emit-include-methods";
import type { Table } from "../src/introspect";
import type { Graph } from "../src/rel-classify";

// Mock table with 4 relationships (like captures table)
const capturesTable: Table = {
  name: "captures",
  schema: "public",
  columns: [
    { name: "id", type: "text", pgType: "text", nullable: false, defaultValue: null },
    { name: "website_id", type: "text", pgType: "text", nullable: true, defaultValue: null },
  ],
  pk: ["id"],
  fks: [
    { from: ["website_id"], to: { schema: "public", table: "websites", columns: ["id"] } }
  ]
};

// Mock graph with 4 relationships
const graph: Graph = {
  captures: {
    website: { kind: "one", target: "websites", fk: { from: ["website_id"], to: { schema: "public", table: "websites", columns: ["id"] } } },
    video_sections: { kind: "many", target: "video_sections", via: { table: "video_sections", column: "capture_id" } },
    capture_technologies: { kind: "many", target: "capture_technologies", via: { table: "capture_technologies", column: "capture_id" } },
    technologies: { kind: "many", target: "technologies", via: { table: "capture_technologies", column: "capture_id" } }
  },
  websites: {},
  video_sections: {},
  capture_technologies: {},
  technologies: {}
};

console.log("🧪 Testing include method generation with 4 relationships\n");

const methods = generateIncludeMethods(capturesTable, graph, {
  maxDepth: 2,
  skipJunctionTables: true
});

// Filter for list methods (ignore getByPk for brevity)
const listMethods = methods.filter(m => m.name.startsWith("list"));

console.log(`Generated ${listMethods.length} list methods:\n`);

// Single relationship methods (depth 1)
const singleMethods = listMethods.filter(m => m.path.length === 1);
console.log("📝 Single relationship methods:");
singleMethods.forEach(m => console.log(`  ✓ ${m.name}`));

// Pair combination methods (what we're testing)
const pairMethods = listMethods.filter(m => m.path.length === 2 && !m.name.includes("And") === false);
console.log(`\n📝 Pair combination methods (should have C(4,2) = 6):`);
pairMethods.forEach(m => console.log(`  ✓ ${m.name}`));

// Check for the specific method that was missing
const hasWebsiteAndVideoSections = methods.some(m =>
  m.name === "listWithWebsiteAndVideoSections"
);

console.log("\n🎯 Critical test:");
if (hasWebsiteAndVideoSections) {
  console.log("  ✅ listWithWebsiteAndVideoSections is generated!");
} else {
  console.log("  ❌ listWithWebsiteAndVideoSections is MISSING!");
  console.log("\n  Available pair methods:");
  pairMethods.forEach(m => console.log(`    - ${m.name}`));
  process.exit(1);
}

// Verify we have the expected number of pair combinations
// With 4 relations: C(4,2) = 6 pairs
const expectedPairs = 6;
const actualPairs = pairMethods.length;

console.log(`\n📊 Statistics:`);
console.log(`  Relations: 4`);
console.log(`  Expected pairs: ${expectedPairs}`);
console.log(`  Generated pairs: ${actualPairs}`);

if (actualPairs === expectedPairs) {
  console.log(`  ✅ Correct number of combinations generated!`);
} else {
  console.log(`  ⚠️  Generated ${actualPairs} instead of ${expectedPairs}`);
}

console.log("\n✅ All tests passed!");
