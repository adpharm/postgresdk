import type { Table, Model } from "./introspect";
import { pascal } from "./utils";

/**
 * Generate basic SDK tests for a table
 */
export function emitTableTest(table: Table, clientPath: string, framework: "vitest" | "jest" | "bun" = "vitest") {
  const Type = pascal(table.name);
  const tableName = table.name;
  
  // Import statements based on framework
  const imports = getFrameworkImports(framework);
  
  // Check if this table has foreign keys
  const hasForeignKeys = table.fks.length > 0;
  const foreignKeySetup = hasForeignKeys ? generateForeignKeySetup(table, clientPath) : null;
  
  // Generate sample data based on column types
  const sampleData = generateSampleData(table, hasForeignKeys);
  const updateData = generateUpdateData(table);
  
  return `${imports}
import { SDK } from '${clientPath}';
import type { Insert${Type}, Update${Type}, Select${Type} } from '${clientPath}/types/${tableName}';
${foreignKeySetup?.imports || ''}

/**
 * Basic tests for ${tableName} table operations
 * 
 * These tests demonstrate basic CRUD operations.
 * The test data is auto-generated and may need adjustment for your specific schema.
 * 
 * If tests fail due to validation errors:
 * 1. Check which fields are required by your API
 * 2. Update the test data below to match your schema requirements
 * 3. Consider adding your own business logic tests in separate files
 */
describe('${Type} SDK Operations', () => {
  let sdk: SDK;
  let createdId: string;
  ${foreignKeySetup?.variables || ''}
  
  beforeAll(async () => {
    sdk = new SDK({ 
      baseUrl: process.env.API_URL || 'http://localhost:3000',
      auth: process.env.API_KEY ? { apiKey: process.env.API_KEY } : undefined
    });
    ${foreignKeySetup?.setup || ''}
  });
  
  ${hasForeignKeys && foreignKeySetup?.cleanup ? `afterAll(async () => {
    ${foreignKeySetup.cleanup}
  });
  
  ` : ''}${generateTestCases(table, sampleData, updateData, hasForeignKeys)}
});
`;
}

/**
 * Generate a test setup file
 */
export function emitTestSetup(clientPath: string, framework: "vitest" | "jest" | "bun" = "vitest") {
  return `/**
 * Test Setup and Utilities
 * 
 * This file provides common test utilities and configuration.
 * Extend this with your own helpers as needed.
 */

${getFrameworkImports(framework)}

// Test database connection
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

// API configuration
export const TEST_API_URL = process.env.TEST_API_URL || 'http://localhost:3000';
export const TEST_API_KEY = process.env.TEST_API_KEY;

// Utility to create SDK instance
export function createTestSDK() {
  const { SDK } = require('${clientPath}');
  return new SDK({
    baseUrl: TEST_API_URL,
    auth: TEST_API_KEY ? { apiKey: TEST_API_KEY } : undefined
  });
}

// Utility to generate random test data
export function randomString(prefix = 'test'): string {
  return \`\${prefix}_\${Date.now()}_\${Math.random().toString(36).substr(2, 9)}\`;
}

export function randomEmail(): string {
  return \`\${randomString('user')}@example.com\`;
}

export function randomInt(min = 1, max = 1000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomDate(): Date {
  const start = new Date(2020, 0, 1);
  const end = new Date();
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}
`;
}

/**
 * Generate vitest config file
 */
export function emitVitestConfig() {
  return `import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    // The reporters are configured via CLI in the test script
    // Force color output in terminal
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      }
    }
  },
});
`;
}

/**
 * Generate .gitignore for test directory
 */
export function emitTestGitignore() {
  return `# Test results
test-results/
*.log

# Node modules (if tests have their own dependencies)
node_modules/

# Environment files
.env
.env.local
.env.test

# Coverage reports
coverage/
*.lcov
`;
}

/**
 * Generate docker-compose.yml for test database
 */
export function emitDockerCompose() {
  return `# Docker Compose for Test Database
# 
# Start: docker-compose up -d
# Stop: docker-compose down
# Reset: docker-compose down -v && docker-compose up -d

version: '3.8'

services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: testdb
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U testuser"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
`;
}

/**
 * Generate test runner script
 */
export function emitTestScript(framework: "vitest" | "jest" | "bun" = "vitest") {
  const runCommand = framework === "bun" ? "bun test" : framework;
  
  return `#!/bin/bash
# Test Runner Script
# 
# This script sets up and runs tests with a Docker PostgreSQL database.
# 
# Usage:
#   chmod +x run-tests.sh  # Make executable (first time only)
#   ./run-tests.sh
#
# Prerequisites:
#   - Docker installed and running
#   - Your API server code in the parent directories
#   - Test framework installed (${framework})

set -e

SCRIPT_DIR="$( cd "$( dirname "\${BASH_SOURCE[0]}" )" && pwd )"

echo "🐳 Starting test database..."
cd "$SCRIPT_DIR"
docker-compose up -d --wait

# Export test database URL
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5432/testdb"
export TEST_API_URL="http://localhost:3000"

# Force color output for better terminal experience
export FORCE_COLOR=1
export CI=""

# Wait for database to be ready
echo "⏳ Waiting for database..."
sleep 3

# TODO: Run your migrations on the test database
# Example:
# echo "📊 Running migrations..."
# npm run migrate -- --database-url="$TEST_DATABASE_URL"

echo "🚀 Starting API server..."
echo "⚠️  TODO: Uncomment and customize the API server startup command below:"
echo ""
echo "  # Example for Node.js/Bun:"
echo "  # cd ../.. && npm run dev &"
echo "  # SERVER_PID=\$!"
echo ""
echo "  # Example for custom server file:"
echo "  # cd ../.. && node server.js &"
echo "  # SERVER_PID=\$!"
echo ""
echo "  Please edit this script to start your API server."
echo ""
# cd ../.. && npm run dev &
# SERVER_PID=$!
# sleep 3

echo "🧪 Running tests..."
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
TEST_RESULTS_DIR="$SCRIPT_DIR/test-results"
mkdir -p "$TEST_RESULTS_DIR"

# Run tests with appropriate reporter based on framework
${getTestCommand(framework, runCommand)}

TEST_EXIT_CODE=$?

# Cleanup
# if [ ! -z "\${SERVER_PID}" ]; then
#   echo "🛑 Stopping API server..."
#   kill $SERVER_PID 2>/dev/null || true
# fi

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Tests completed successfully!"
else
  echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

echo ""
echo "📊 Test results saved to:"
echo "  $TEST_RESULTS_DIR/"
echo ""
echo "To stop the test database, run:"
echo "  cd $SCRIPT_DIR && docker-compose down"

exit $TEST_EXIT_CODE
`;
}

// Helper functions

function generateForeignKeySetup(table: Table, clientPath: string): any {
  const imports: string[] = [];
  const variables: string[] = [];
  const setupStatements: string[] = [];
  const cleanupStatements: string[] = [];
  
  // Track unique foreign tables
  const foreignTables = new Set<string>();
  
  for (const fk of table.fks) {
    const foreignTable = fk.toTable;
    if (!foreignTables.has(foreignTable)) {
      foreignTables.add(foreignTable);
      const ForeignType = pascal(foreignTable);
      
      // Add import for the foreign table types
      imports.push(`import type { Insert${ForeignType} } from '${clientPath}/types/${foreignTable}';`);
      
      // Add variable to store created foreign record ID
      variables.push(`let ${foreignTable}Id: string;`);
      
      // Add setup to create a parent record
      setupStatements.push(`
    // Create parent ${foreignTable} record for foreign key reference
    const ${foreignTable}Data = ${generateMinimalSampleData(foreignTable)};
    const created${ForeignType} = await sdk.${foreignTable}.create(${foreignTable}Data);
    ${foreignTable}Id = created${ForeignType}.id;`);
      
      // Add cleanup to delete parent record
      cleanupStatements.push(`
    // Clean up parent ${foreignTable} record
    if (${foreignTable}Id) {
      try {
        await sdk.${foreignTable}.delete(${foreignTable}Id);
      } catch (e) {
        // Parent might already be deleted due to cascading
      }
    }`);
    }
  }
  
  return {
    imports: imports.join('\n'),
    variables: variables.join('\n  '),
    setup: setupStatements.join(''),
    cleanup: cleanupStatements.join('')
  };
}

function generateMinimalSampleData(tableName: string): string {
  // Generate minimal valid data for creating a parent record
  // This is a simplified version - in reality would need the table schema
  const commonPatterns: Record<string, string> = {
    'contacts': `{ name: 'Test Contact', email: 'test@example.com', gender: 'M', date_of_birth: new Date('1990-01-01'), emergency_contact: 'Emergency Contact', clinic_location: 'Main Clinic', specialty: 'General', fmv_tiering: 'Standard', flight_preferences: 'Economy', dietary_restrictions: [], special_accommodations: 'None' }`,
    'tags': `{ name: 'Test Tag' }`,
    'authors': `{ name: 'Test Author' }`,
    'books': `{ title: 'Test Book' }`, // Don't include author_id here - it might not exist
    'users': `{ name: 'Test User', email: 'test@example.com' }`,
    'categories': `{ name: 'Test Category' }`,
    'products': `{ name: 'Test Product', price: 10.99 }`,
    'orders': `{ total: 100.00 }`, // Don't include customer_id - might not exist
  };
  
  return commonPatterns[tableName] || `{ name: 'Test ${pascal(tableName)}' }`;
}

function getTestCommand(framework: "vitest" | "jest" | "bun", baseCommand: string): string {
  switch (framework) {
    case "vitest":
      // Vitest with both console and JSON reporters, force colors
      return `FORCE_COLOR=1 ${baseCommand} --reporter=default --reporter=json --outputFile="$TEST_RESULTS_DIR/results-\${TIMESTAMP}.json" "$@"`;
    case "jest":
      // Jest with both console and JSON output, force colors
      return `FORCE_COLOR=1 ${baseCommand} --colors --json --outputFile="$TEST_RESULTS_DIR/results-\${TIMESTAMP}.json" "$@"`;
    case "bun":
      // Bun test with color output preserved via tee
      return `FORCE_COLOR=1 ${baseCommand} "$@" 2>&1 | tee "$TEST_RESULTS_DIR/results-\${TIMESTAMP}.txt"`;
    default:
      return `FORCE_COLOR=1 ${baseCommand} "$@"`;
  }
}

function getFrameworkImports(framework: "vitest" | "jest" | "bun"): string {
  switch (framework) {
    case "vitest":
      return "import { describe, it, expect, beforeAll, afterAll } from 'vitest';";
    case "jest":
      return "// Jest is configured globally, no imports needed";
    case "bun":
      return "import { describe, it, expect, beforeAll, afterAll } from 'bun:test';";
    default:
      return "import { describe, it, expect, beforeAll, afterAll } from 'vitest';";
  }
}

function generateSampleData(table: Table, hasForeignKeys: boolean = false): string {
  const fields: string[] = [];
  
  // Track which columns are foreign keys
  const foreignKeyColumns = new Map<string, string>();
  if (hasForeignKeys) {
    for (const fk of table.fks) {
      // Assuming single column foreign keys for simplicity
      if (fk.from.length === 1 && fk.from[0]) {
        foreignKeyColumns.set(fk.from[0], fk.toTable);
      }
    }
  }
  
  for (const col of table.columns) {
    // Skip only truly auto-generated columns
    if (col.name === 'id' && col.hasDefault) {
      continue;
    }
    if ((col.name === 'created_at' || col.name === 'updated_at') && col.hasDefault) {
      continue;
    }
    
    // Skip deleted_at (soft delete column)
    if (col.name === 'deleted_at') {
      continue;
    }
    
    // ALWAYS include non-nullable columns
    if (!col.nullable) {
      // Check if this is a foreign key column
      const foreignTable = foreignKeyColumns.get(col.name);
      const value = foreignTable 
        ? `${foreignTable}Id` // Use the variable created in beforeAll
        : getSampleValue(col.pgType, col.name);
      fields.push(`    ${col.name}: ${value}`);
    } else {
      // For nullable columns, include them if they look important (foreign keys, certain names, etc.)
      const isImportant = col.name.endsWith('_id') || 
                         col.name.endsWith('_by') ||
                         col.name.includes('email') ||
                         col.name.includes('name') ||
                         col.name.includes('phone') ||
                         col.name.includes('address') ||
                         col.name.includes('description') ||
                         col.name.includes('color') ||
                         col.name.includes('type') ||
                         col.name.includes('status') ||
                         col.name.includes('subject');
      
      if (isImportant) {
        // Check if this is a foreign key column even if nullable
        const foreignTable = foreignKeyColumns.get(col.name);
        const value = foreignTable 
          ? `${foreignTable}Id` // Use the variable created in beforeAll
          : getSampleValue(col.pgType, col.name);
        fields.push(`    ${col.name}: ${value}`);
      }
    }
  }
  
  return fields.length > 0 ? `{\n${fields.join(',\n')}\n  }` : '{}';
}

function generateUpdateData(table: Table): string {
  const fields: string[] = [];
  
  for (const col of table.columns) {
    // Skip primary keys and auto-generated columns
    if (col.hasDefault ||
        col.name === 'id' ||
        col.name === 'created_at' ||
        col.name === 'updated_at') {
      continue;
    }
    
    // Only update first non-nullable field for simplicity
    if (!col.nullable && fields.length === 0) {
      const value = getSampleValue(col.pgType, col.name, true);
      fields.push(`    ${col.name}: ${value}`);
      break;
    }
  }
  
  return fields.length > 0 ? `{\n${fields.join(',\n')}\n  }` : '{}';
}

function getSampleValue(type: string, name: string, isUpdate = false): string {
  const suffix = isUpdate ? ' + " (updated)"' : '';
  
  // Handle foreign keys and special ID columns
  if (name.endsWith('_id') || name.endsWith('_by')) {
    // Generate valid UUID for foreign key references
    return `'550e8400-e29b-41d4-a716-446655440000'`;
  }
  
  // Handle specific column names
  if (name.includes('email')) {
    return `'test${isUpdate ? '.updated' : ''}@example.com'`;
  }
  if (name === 'color') {
    return `'#${isUpdate ? 'FF0000' : '0000FF'}'`;
  }
  if (name === 'gender') {
    return `'${isUpdate ? 'F' : 'M'}'`;
  }
  if (name.includes('phone')) {
    return `'${isUpdate ? '555-0200' : '555-0100'}'`;
  }
  if (name.includes('address')) {
    return `'123 ${isUpdate ? 'Updated' : 'Test'} Street'`;
  }
  if (name === 'type' || name === 'status') {
    return `'${isUpdate ? 'updated' : 'active'}'`;
  }
  if (name === 'subject') {
    return `'Test Subject${isUpdate ? ' Updated' : ''}'`;
  }
  if (name.includes('name') || name.includes('title')) {
    return `'Test ${pascal(name)}'${suffix}`;
  }
  if (name.includes('description') || name.includes('bio') || name.includes('content')) {
    return `'Test description'${suffix}`;
  }
  if (name.includes('preferences') || name.includes('settings')) {
    return `'Test preferences'${suffix}`;
  }
  if (name.includes('restrictions') || name.includes('dietary')) {
    return `['vegetarian']`;
  }
  if (name.includes('location') || name.includes('clinic')) {
    return `'Test Location'${suffix}`;
  }
  if (name.includes('specialty')) {
    return `'General'`;
  }
  if (name.includes('tier')) {
    return `'Standard'`;
  }
  if (name.includes('emergency')) {
    return `'Emergency Contact ${isUpdate ? 'Updated' : 'Name'}'`;
  }
  if (name === 'date_of_birth' || name.includes('birth')) {
    return `new Date('1990-01-01')`;
  }
  if (name.includes('accommodations')) {
    return `'No special accommodations'`;
  }
  if (name.includes('flight')) {
    return `'Economy'`;
  }
  
  // Handle PostgreSQL types
  switch (type) {
    case 'text':
    case 'varchar':
    case 'char':
      return `'test_value'${suffix}`;
    case 'int':
    case 'integer':
    case 'smallint':
    case 'bigint':
      return isUpdate ? '42' : '1';
    case 'decimal':
    case 'numeric':
    case 'real':
    case 'double precision':
    case 'float':
      return isUpdate ? '99.99' : '10.50';
    case 'boolean':
    case 'bool':
      return isUpdate ? 'false' : 'true';
    case 'date':
      return `'2024-01-01'`;
    case 'timestamp':
    case 'timestamptz':
      return `new Date()`;
    case 'json':
    case 'jsonb':
      return `{ key: 'value' }`;
    case 'uuid':
      return `'${isUpdate ? '550e8400-e29b-41d4-a716-446655440001' : '550e8400-e29b-41d4-a716-446655440000'}'`;
    case 'text[]':
    case 'varchar[]':
      return `['item1', 'item2']`;
    default:
      return `'test'`;
  }
}

function generateTestCases(table: Table, sampleData: string, updateData: string, hasForeignKeys: boolean = false): string {
  const Type = pascal(table.name);
  const hasData = sampleData !== '{}';
  
  return `it('should create a ${table.name}', async () => {
    const data: Insert${Type} = ${sampleData};
    ${hasData ? `
    const created = await sdk.${table.name}.create(data);
    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    createdId = created.id;
    ` : `
    // Table has only auto-generated columns
    // Skip create test or add your own test data
    expect(true).toBe(true);
    `}
  });
  
  it('should list ${table.name}', async () => {
    const list = await sdk.${table.name}.list({ limit: 10 });
    expect(Array.isArray(list)).toBe(true);
  });
  
  ${hasData ? `it('should get ${table.name} by id', async () => {
    if (!createdId) {
      console.warn('No ID from create test, skipping get test');
      return;
    }
    
    const item = await sdk.${table.name}.getByPk(createdId);
    expect(item).toBeDefined();
    expect(item?.id).toBe(createdId);
  });
  
  ${updateData !== '{}' ? `it('should update ${table.name}', async () => {
    if (!createdId) {
      console.warn('No ID from create test, skipping update test');
      return;
    }
    
    const updateData: Update${Type} = ${updateData};
    const updated = await sdk.${table.name}.update(createdId, updateData);
    expect(updated).toBeDefined();
  });` : ''}
  
  it('should delete ${table.name}', async () => {
    if (!createdId) {
      console.warn('No ID from create test, skipping delete test');
      return;
    }
    
    const deleted = await sdk.${table.name}.delete(createdId);
    expect(deleted).toBeDefined();
    
    // Verify deletion
    const item = await sdk.${table.name}.getByPk(createdId);
    expect(item).toBeNull();
  });` : ''}`;
}