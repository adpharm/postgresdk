import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './test/drizzle-e2e/schema.ts',
  out: './test/drizzle-e2e/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://user:pass@localhost:5432/drizzle_test',
  },
  verbose: true,
  strict: true,
});