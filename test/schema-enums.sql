-- test/schema-enums.sql
-- Test schema for enum type generation

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Drop tables and enums in dependency order
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS product_status CASCADE;
DROP TYPE IF EXISTS priority_level CASCADE;

-- Create enum types
CREATE TYPE user_role AS ENUM ('admin', 'moderator', 'user', 'guest');
CREATE TYPE product_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE priority_level AS ENUM ('low', 'medium', 'high', 'critical');

-- Users table with enum column
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'user',
  backup_role user_role  -- nullable enum
);

-- Products table with multiple enum columns
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status product_status NOT NULL DEFAULT 'draft',
  priority priority_level NOT NULL,
  tags user_role[]  -- array of enum values
);
