import type { Table, Model } from "./introspect";
import { pascal } from "./utils";

/**
 * Generate basic SDK tests for a table
 */
export function emitTableTest(table: Table, model: Model, clientPath: string, framework: "vitest" | "jest" | "bun" = "vitest") {
  const Type = pascal(table.name);
  const tableName = table.name;
  
  // Import statements based on framework
  const imports = getFrameworkImports(framework);
  
  // Check if this is a junction table (composite primary key)
  const isJunctionTable = table.pk.length > 1;
  
  // Check if this table has foreign keys
  const hasForeignKeys = table.fks.length > 0;
  const foreignKeySetup = hasForeignKeys ? generateForeignKeySetup(table, model, clientPath) : null;
  
  // Generate sample data based on actual column schema
  const sampleData = generateSampleDataFromSchema(table, hasForeignKeys);
  const updateData = generateUpdateDataFromSchema(table);
  
  // For junction tables, don't test CRUD operations the same way
  if (isJunctionTable) {
    return `${imports}
import { SDK } from '${clientPath}';
import type { Insert${Type}, Update${Type}, Select${Type} } from '${clientPath}/types/${tableName}';
${foreignKeySetup?.imports || ''}

/**
 * Basic tests for ${tableName} table operations
 * 
 * This is a junction table with composite primary key.
 * Tests are simplified since it represents a many-to-many relationship.
 */
describe('${Type} SDK Operations', () => {
  let sdk: SDK;
  ${foreignKeySetup?.variables || ''}
  
  beforeAll(async () => {
    sdk = new SDK({ 
      baseUrl: process.env.API_URL || 'http://localhost:3000',
      auth: process.env.API_KEY ? { apiKey: process.env.API_KEY } : undefined
    });
    ${foreignKeySetup?.setup || ''}
  });
  
  ${foreignKeySetup?.cleanup ? `afterAll(async () => {
    ${foreignKeySetup.cleanup}
  });
  
  ` : ''}it('should create a ${tableName} relationship', async () => {
    const data: Insert${Type} = ${sampleData};
    
    const created = await sdk.${tableName}.create(data);
    expect(created).toBeDefined();
  });
  
  it('should list ${tableName} relationships', async () => {
    const list = await sdk.${tableName}.list({ limit: 10 });
    expect(Array.isArray(list)).toBe(true);
  });
});
`;
  }
  
  // Regular table with single primary key
  return `${imports}
import { SDK } from '${clientPath}';
import type { Insert${Type}, Update${Type}, Select${Type} } from '${clientPath}/types/${tableName}';
${foreignKeySetup?.imports || ''}

/**
 * Basic tests for ${tableName} table operations
 * 
 * These tests demonstrate basic CRUD operations.
 * The test data is auto-generated based on your schema.
 * 
 * If tests fail:
 * 1. Check the error messages for missing required fields
 * 2. Update the test data below to match your business requirements
 * 3. Consider adding custom tests for business logic in separate files
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
    container_name: postgresdk-test-database
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
export function emitTestScript(framework: "vitest" | "jest" | "bun" = "vitest", testDirPath?: string) {
  const runCommand = framework === "bun" ? "bun test" : framework;
  
  // Calculate how many levels up to get to project root from test directory
  // Default assumes tests are in something like ./api/tests or ./tests
  const pathToRoot = testDirPath 
    ? testDirPath.split('/').filter(p => p && p !== '.').map(() => '..').join('/')
    : '../..';
  
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

# PROJECT_ROOT is the root of your project
# Use this to reference files from your project root
# Example: $PROJECT_ROOT/src/server.ts
PROJECT_ROOT="$( cd "$SCRIPT_DIR/${pathToRoot}" && pwd )"

echo "📍 Project root: $PROJECT_ROOT"
echo "📍 Test directory: $SCRIPT_DIR"

# Cleanup function to ensure database is stopped
cleanup() {
  echo ""
  echo "🧹 Cleaning up..."
  if [ ! -z "\${SERVER_PID}" ]; then
    echo "   Stopping API server..."
    kill $SERVER_PID 2>/dev/null || true
  fi
  echo "   Stopping test database..."
  docker-compose -f "$SCRIPT_DIR/docker-compose.yml" stop 2>/dev/null || true
  echo "   Done!"
}

# Set up cleanup trap
trap cleanup EXIT INT TERM

# Check for existing PostgreSQL container or connection
echo "🔍 Checking for existing database connections..."
if docker ps | grep -q "5432->5432"; then
  echo "⚠️  Found existing PostgreSQL container on port 5432"
  echo "   Stopping existing container..."
  docker ps --filter "publish=5432" --format "{{.ID}}" | xargs -r docker stop
  sleep 2
fi

# Clean up any existing test database container
if docker ps -a | grep -q "postgresdk-test-database"; then
  echo "🧹 Cleaning up existing test database container..."
  docker-compose -f "$SCRIPT_DIR/docker-compose.yml" down -v
  sleep 2
fi

echo "🐳 Starting fresh test database..."
cd "$SCRIPT_DIR"
docker-compose up -d --wait

# Export test database URL
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5432/testdb"
export TEST_API_URL="http://localhost:3000"

# Wait for database to be ready
echo "⏳ Waiting for database..."
sleep 3

# MIGRATION_COMMAND:
# Add your migration command here. Examples using PROJECT_ROOT:
# MIGRATION_COMMAND="cd $PROJECT_ROOT && npx prisma migrate deploy"
# MIGRATION_COMMAND="cd $PROJECT_ROOT && npx drizzle-kit push --config=./drizzle.config.ts"
# MIGRATION_COMMAND="cd $PROJECT_ROOT && npm run migrate up"
# MIGRATION_COMMAND="DATABASE_URL=$TEST_DATABASE_URL node $PROJECT_ROOT/scripts/migrate.js"

# Or skip migrations if your database is pre-configured:
# SKIP_MIGRATIONS=true

if [ -z "\${MIGRATION_COMMAND}" ] && [ -z "\${SKIP_MIGRATIONS}" ]; then
  echo "❌ ERROR: No migration strategy configured!"
  echo ""
  echo "   Please edit this script and either:"
  echo "   1. Set MIGRATION_COMMAND with your migration command"
  echo "   2. Set SKIP_MIGRATIONS=true if migrations aren't needed"
  echo ""
  echo "   See the comments above for examples."
  echo ""
  exit 1
fi

if [ ! -z "\${MIGRATION_COMMAND}" ]; then
  echo "📊 Running migrations..."
  echo "   Command: \${MIGRATION_COMMAND}"
  eval "\${MIGRATION_COMMAND}"
  if [ \$? -ne 0 ]; then
    echo "❌ Migration failed! Please check your migration command and database connection."
    exit 1
  fi
  echo "✅ Migrations completed successfully"
  echo "⏳ Waiting for database to settle..."
  sleep 2
elif [ "\${SKIP_MIGRATIONS}" = "true" ]; then
  echo "⏭️  Skipping migrations (SKIP_MIGRATIONS=true)"
else
  echo "❌ Invalid migration configuration"
  exit 1
fi

echo ""
echo "🚀 Starting API server..."
echo "⚠️  TODO: Uncomment and customize the API server startup command below:"
echo ""
echo "  # Example for Node.js/Bun using PROJECT_ROOT:"
echo "  # cd \\$PROJECT_ROOT && npm run dev &"
echo "  # SERVER_PID=\\$!"
echo ""
echo "  # Example for custom server file:"
echo "  # DATABASE_URL=\\$TEST_DATABASE_URL node \\$PROJECT_ROOT/src/server.js &"
echo "  # SERVER_PID=\\$!"
echo ""
echo "  # Example for Bun:"
echo "  # DATABASE_URL=\\$TEST_DATABASE_URL bun \\$PROJECT_ROOT/src/index.ts &"
echo "  # SERVER_PID=\\$!"
echo ""
echo "  Please edit this script to start your API server."
echo ""
# cd $PROJECT_ROOT && npm run dev &
# SERVER_PID=$!
# sleep 3

echo "🧪 Running tests..."
TIMESTAMP=\$(date +%Y%m%d_%H%M%S)
TEST_RESULTS_DIR="$SCRIPT_DIR/test-results"
mkdir -p "$TEST_RESULTS_DIR"

# Run tests with appropriate reporter based on framework
${getTestCommand(framework, runCommand)}

TEST_EXIT_CODE=$?

if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo "✅ Tests completed successfully!"
else
  echo "❌ Tests failed with exit code $TEST_EXIT_CODE"
fi

echo ""
echo "📊 Test results saved to:"
echo "  $TEST_RESULTS_DIR/"
echo ""
echo "💡 Tips:"
echo "  - Database will be stopped automatically on script exit"
echo "  - To manually stop the database: docker-compose -f $SCRIPT_DIR/docker-compose.yml down"
echo "  - To reset the database: docker-compose -f $SCRIPT_DIR/docker-compose.yml down -v"

exit $TEST_EXIT_CODE
`;
}

// Helper functions

function generateForeignKeySetup(table: Table, model: Model, clientPath: string): any {
  const imports: string[] = [];
  const variables: string[] = [];
  const setupStatements: string[] = [];
  const cleanupStatements: string[] = [];
  
  // Track unique foreign tables
  const foreignTablesData = new Map<string, Table>();
  
  for (const fk of table.fks) {
    const foreignTableName = fk.toTable;
    if (!foreignTablesData.has(foreignTableName)) {
      const foreignTable = model.tables[foreignTableName];
      if (!foreignTable) continue;
      
      foreignTablesData.set(foreignTableName, foreignTable);
      const ForeignType = pascal(foreignTableName);
      
      // Add import for the foreign table types
      imports.push(`import type { Insert${ForeignType} } from '${clientPath}/types/${foreignTableName}';`);
      
      // Determine if foreign table has single or composite PK
      if (foreignTable.pk.length === 1) {
        // Single PK - store just the ID
        variables.push(`let ${foreignTableName}Id: string;`);
        
        // Generate valid data for the foreign table based on its ACTUAL schema
        const foreignData = generateSampleDataFromSchema(foreignTable, false);
        
        setupStatements.push(`
    // Create parent ${foreignTableName} record for foreign key reference
    const ${foreignTableName}Data: Insert${ForeignType} = ${foreignData};
    const created${ForeignType} = await sdk.${foreignTableName}.create(${foreignTableName}Data);
    ${foreignTableName}Id = created${ForeignType}.${foreignTable.pk[0]};`);
        
        cleanupStatements.push(`
    // Clean up parent ${foreignTableName} record
    if (${foreignTableName}Id) {
      try {
        await sdk.${foreignTableName}.delete(${foreignTableName}Id);
      } catch (e) {
        // Parent might already be deleted due to cascading
      }
    }`);
      } else {
        // Composite PK - store the entire object
        variables.push(`let ${foreignTableName}Key: any;`);
        
        const foreignData = generateSampleDataFromSchema(foreignTable, false);
        
        setupStatements.push(`
    // Create parent ${foreignTableName} record for foreign key reference
    const ${foreignTableName}Data: Insert${ForeignType} = ${foreignData};
    const created${ForeignType} = await sdk.${foreignTableName}.create(${foreignTableName}Data);
    ${foreignTableName}Key = { ${foreignTable.pk.map(pk => `${pk}: created${ForeignType}.${pk}`).join(', ')} };`);
        
        cleanupStatements.push(`
    // Clean up parent ${foreignTableName} record
    if (${foreignTableName}Key) {
      try {
        await sdk.${foreignTableName}.delete(${foreignTableName}Key);
      } catch (e) {
        // Parent might already be deleted due to cascading
      }
    }`);
      }
    }
  }
  
  return {
    imports: imports.join('\n'),
    variables: variables.join('\n  '),
    setup: setupStatements.join(''),
    cleanup: cleanupStatements.join('')
  };
}

function getTestCommand(framework: "vitest" | "jest" | "bun", baseCommand: string): string {
  switch (framework) {
    case "vitest":
      // Vitest with both console and JSON reporters
      // Colors will work in terminal but won't pollute JSON output
      return `${baseCommand} --reporter=default --reporter=json --outputFile="$TEST_RESULTS_DIR/results-\${TIMESTAMP}.json" "$@"`;
    case "jest":
      // Jest with JSON output, colors work in terminal automatically
      return `${baseCommand} --json --outputFile="$TEST_RESULTS_DIR/results-\${TIMESTAMP}.json" "$@"`;
    case "bun":
      // Bun test - use NO_COLOR=1 when piping to file to keep it clean
      return `NO_COLOR=1 ${baseCommand} "$@" 2>&1 | tee "$TEST_RESULTS_DIR/results-\${TIMESTAMP}.txt"`;
    default:
      return `${baseCommand} "$@"`;
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

/**
 * Generate sample data based on actual table schema
 */
function generateSampleDataFromSchema(table: Table, hasForeignKeys: boolean = false): string {
  const fields: string[] = [];
  
  // Track which columns are foreign keys
  const foreignKeyColumns = new Map<string, string>();
  if (hasForeignKeys) {
    for (const fk of table.fks) {
      // Handle both single and multi-column foreign keys
      for (let i = 0; i < fk.from.length; i++) {
        const fromCol = fk.from[i];
        if (fromCol) {
          foreignKeyColumns.set(fromCol, fk.toTable);
        }
      }
    }
  }
  
  for (const col of table.columns) {
    // Skip truly auto-generated columns (id with default, timestamps with default)
    const isAutoGenerated = col.hasDefault && 
      ['id', 'created_at', 'updated_at', 'created', 'updated', 'modified_at'].includes(col.name.toLowerCase());
    
    // Skip primary key columns if they're auto-generated
    const isPrimaryKey = table.pk.includes(col.name);
    if (isPrimaryKey && col.hasDefault) {
      continue;
    }
    
    if (isAutoGenerated) {
      continue;
    }
    
    // Check if this is a foreign key column
    const foreignTable = foreignKeyColumns.get(col.name);
    
    // Include the field if:
    // 1. It's non-nullable (required)
    // 2. It's a foreign key
    // 3. It's part of a composite primary key
    
    if (!col.nullable || foreignTable || isPrimaryKey) {
      if (foreignTable) {
        // Reference the variable created in beforeAll
        fields.push(`    ${col.name}: ${foreignTable}Id`);
      } else {
        // Generate appropriate value based on column type
        const value = generateValueForColumn(col);
        fields.push(`    ${col.name}: ${value}`);
      }
    }
  }
  
  return fields.length > 0 ? `{\n${fields.join(',\n')}\n  }` : '{}';
}

/**
 * Generate update data based on table schema
 */
function generateUpdateDataFromSchema(table: Table): string {
  const fields: string[] = [];
  
  // Find first updatable field (non-PK, non-auto-generated)
  for (const col of table.columns) {
    // Skip primary keys and auto-generated columns
    if (table.pk.includes(col.name)) {
      continue;
    }
    
    const isAutoGenerated = col.hasDefault && 
      ['id', 'created_at', 'updated_at', 'created', 'updated', 'modified_at'].includes(col.name.toLowerCase());
    
    if (isAutoGenerated) {
      continue;
    }
    
    // Skip foreign keys for update (keep relationships stable)
    if (col.name.endsWith('_id')) {
      continue;
    }
    
    // Use first non-nullable field for update
    if (!col.nullable) {
      const value = generateValueForColumn(col, true);
      fields.push(`    ${col.name}: ${value}`);
      break; // Only update one field for simplicity
    }
  }
  
  // If no non-nullable fields found, try nullable ones
  if (fields.length === 0) {
    for (const col of table.columns) {
      if (table.pk.includes(col.name) || col.name.endsWith('_id')) {
        continue;
      }
      
      const isAutoGenerated = col.hasDefault && 
        ['id', 'created_at', 'updated_at', 'created', 'updated', 'modified_at'].includes(col.name.toLowerCase());
      
      if (!isAutoGenerated) {
        const value = generateValueForColumn(col, true);
        fields.push(`    ${col.name}: ${value}`);
        break;
      }
    }
  }
  
  return fields.length > 0 ? `{\n${fields.join(',\n')}\n  }` : '{}';
}

/**
 * Should we include this nullable column in test data?
 */
function shouldIncludeNullableColumn(col: { name: string, pgType: string }): boolean {
  const importantPatterns = [
    '_id', '_by', 'email', 'name', 'title', 'description',
    'phone', 'address', 'status', 'type', 'category',
    'price', 'amount', 'quantity', 'url', 'slug'
  ];
  
  const name = col.name.toLowerCase();
  return importantPatterns.some(pattern => name.includes(pattern));
}

/**
 * Generate a value for a column based ONLY on its PostgreSQL type
 */
function generateValueForColumn(col: { name: string, pgType: string }, isUpdate = false): string {
  const type = col.pgType.toLowerCase();
  
  // Handle PostgreSQL types - just generate valid data
  switch (type) {
    // Text types
    case 'text':
    case 'varchar':
    case 'char':
    case 'character varying':
    case 'bpchar':
    case 'name':
      return `'str_${Math.random().toString(36).substring(7)}'`;
    
    // Integer types
    case 'int':
    case 'int2':
    case 'int4':
    case 'int8':
    case 'integer':
    case 'smallint':
    case 'bigint':
    case 'serial':
    case 'bigserial':
      return isUpdate ? '42' : '1';
    
    // Decimal/Float types
    case 'decimal':
    case 'numeric':
    case 'real':
    case 'double precision':
    case 'float':
    case 'float4':
    case 'float8':
    case 'money':
      return isUpdate ? '99.99' : '10.50';
    
    // Boolean
    case 'boolean':
    case 'bool':
      return isUpdate ? 'false' : 'true';
    
    // Date/Time types
    case 'date':
      return `'2024-01-01'`;
    case 'timestamp':
    case 'timestamptz':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
      return `'2024-01-01T00:00:00.000Z'`;
    case 'time':
    case 'timetz':
    case 'time without time zone':
    case 'time with time zone':
      return `'12:00:00'`;
    
    case 'interval':
      return `'1 day'`;
    
    // JSON types
    case 'json':
    case 'jsonb':
      return `{}`;
    
    // UUID
    case 'uuid':
      return `'${generateUUID()}'`;
    
    // Network types
    case 'inet':
      return `'192.168.1.1'`;
    
    case 'cidr':
      return `'192.168.1.0/24'`;
    
    case 'macaddr':
    case 'macaddr8':
      return `'08:00:2b:01:02:03'`;
    
    // Geometric types
    case 'point':
      return `'(1,2)'`;
    
    case 'line':
      return `'{1,2,3}'`;
    
    case 'lseg':
      return `'[(0,0),(1,1)]'`;
    
    case 'box':
      return `'((0,0),(1,1))'`;
    
    case 'path':
      return `'[(0,0),(1,1),(2,0)]'`;
    
    case 'polygon':
      return `'((0,0),(1,1),(1,0))'`;
    
    case 'circle':
      return `'<(0,0),1>'`;
    
    // Bit string types
    case 'bit':
    case 'bit varying':
    case 'varbit':
      return `'101'`;
    
    // Binary data
    case 'bytea':
      return `'\\\\x0102'`;
    
    // XML
    case 'xml':
      return `'<root/>'`;
    
    // Text search types
    case 'tsvector':
      return `'a fat cat'`;
    
    case 'tsquery':
      return `'fat & cat'`;
    
    // Other types
    case 'oid':
    case 'regproc':
    case 'regprocedure':
    case 'regoper':
    case 'regoperator':
    case 'regclass':
    case 'regtype':
    case 'regconfig':
    case 'regdictionary':
      return '1';
    
    default:
      // Array types
      if (type.endsWith('[]') || type.startsWith('_')) {
        return `[]`;
      }
      
      // Enum or unknown types - just use a string
      return `'value1'`;
  }
}

// Helper to generate a valid UUID v4
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateTestCases(table: Table, sampleData: string, updateData: string, hasForeignKeys: boolean = false): string {
  const Type = pascal(table.name);
  const hasData = sampleData !== '{}';
  const hasSinglePK = table.pk.length === 1;
  
  return `it('should create a ${table.name}', async () => {
    const data: Insert${Type} = ${sampleData};
    ${hasData ? `
    const created = await sdk.${table.name}.create(data);
    expect(created).toBeDefined();
    ${hasSinglePK ? `expect(created.${table.pk[0]}).toBeDefined();
    createdId = created.${table.pk[0]};` : ''}
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
  
  ${hasData && hasSinglePK ? `it('should get ${table.name} by id', async () => {
    if (!createdId) {
      console.warn('No ID from create test, skipping get test');
      return;
    }
    
    const item = await sdk.${table.name}.getByPk(createdId);
    expect(item).toBeDefined();
    expect(item?.${table.pk[0]}).toBe(createdId);
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