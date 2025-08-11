import type { Table, Model } from "./introspect";
import { pascal } from "./utils";

/**
 * Generate basic SDK tests for a table
 */
export function emitTableTest(table: Table, framework: "vitest" | "jest" | "bun" = "vitest") {
  const Type = pascal(table.name);
  const tableName = table.name;
  
  // Import statements based on framework
  const imports = getFrameworkImports(framework);
  
  // Generate sample data based on column types
  const sampleData = generateSampleData(table);
  const updateData = generateUpdateData(table);
  
  return `${imports}
import { SDK } from '../client';
import type { Insert${Type}, Update${Type}, Select${Type} } from '../client/types/${tableName}';

/**
 * Basic tests for ${tableName} table operations
 * 
 * These tests demonstrate basic CRUD operations.
 * Add your own business logic tests in separate files.
 */
describe('${Type} SDK Operations', () => {
  let sdk: SDK;
  let createdId: string;
  
  beforeAll(() => {
    sdk = new SDK({ 
      baseUrl: process.env.API_URL || 'http://localhost:3000',
      auth: process.env.API_KEY ? { apiKey: process.env.API_KEY } : undefined
    });
  });
  
  ${generateTestCases(table, sampleData, updateData)}
});
`;
}

/**
 * Generate a test setup file
 */
export function emitTestSetup(framework: "vitest" | "jest" | "bun" = "vitest") {
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
  const { SDK } = require('../client');
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
    image: postgres:16-alpine
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
# This script sets up and runs tests with a Docker PostgreSQL database

set -e

echo "🐳 Starting test database..."
docker-compose up -d --wait

# Export test database URL
export TEST_DATABASE_URL="postgres://testuser:testpass@localhost:5432/testdb"
export TEST_API_URL="http://localhost:3000"

# Wait for database to be ready
echo "⏳ Waiting for database..."
sleep 2

# Run migrations if needed (customize this)
# npm run migrate

echo "🚀 Starting API server..."
# Start your API server in the background
# npm run dev &
# SERVER_PID=$!
# sleep 3

echo "🧪 Running tests..."
${runCommand} $@

# Cleanup
# kill $SERVER_PID 2>/dev/null || true

echo "✅ Tests completed!"
`;
}

// Helper functions

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

function generateSampleData(table: Table): string {
  const fields: string[] = [];
  
  for (const col of table.columns) {
    // Skip auto-generated columns
    if (col.hasDefault ||
        col.name === 'id' ||
        col.name === 'created_at' ||
        col.name === 'updated_at') {
      continue;
    }
    
    // Skip nullable columns for simplicity
    if (col.nullable) {
      continue;
    }
    
    const value = getSampleValue(col.pgType, col.name);
    fields.push(`    ${col.name}: ${value}`);
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
  
  if (name.includes('email')) {
    return `'test${isUpdate ? '.updated' : ''}@example.com'`;
  }
  if (name.includes('name') || name.includes('title')) {
    return `'Test ${pascal(name)}'${suffix}`;
  }
  if (name.includes('description') || name.includes('bio') || name.includes('content')) {
    return `'Test description'${suffix}`;
  }
  
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
      return `new Date().toISOString()`;
    case 'json':
    case 'jsonb':
      return `{ key: 'value' }`;
    case 'uuid':
      return `'${isUpdate ? 'b' : 'a'}0e0e0e0-e0e0-e0e0-e0e0-e0e0e0e0e0e0'`;
    default:
      return `'test'`;
  }
}

function generateTestCases(table: Table, sampleData: string, updateData: string): string {
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