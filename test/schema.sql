-- test/schema.sql
-- Re-runnable test schema for the generator harness
-- Covers: 1:N (authors -> books), M:N (books <-> tags via book_tags)

-- Needed for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Needed for vector similarity search
CREATE EXTENSION IF NOT EXISTS "vector";

-- Drop in dependency order (M:N junctions first)
DROP TABLE IF EXISTS video_sections CASCADE;
DROP TABLE IF EXISTS book_tags CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS tags CASCADE;
DROP TABLE IF EXISTS authors CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Authors (parent)
CREATE TABLE authors (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Books (child of authors; 1:N)
CREATE TABLE books (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id  UUID REFERENCES authors(id) ON DELETE CASCADE,
  title      TEXT NOT NULL
);

-- Tags (independent)
CREATE TABLE tags (
  id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL
);

-- Junction table for M:N books <-> tags
CREATE TABLE book_tags (
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

-- Helpful indexes (not strictly required for the test)
CREATE INDEX IF NOT EXISTS idx_books_author ON books(author_id);
CREATE INDEX IF NOT EXISTS idx_book_tags_book ON book_tags(book_id);
CREATE INDEX IF NOT EXISTS idx_book_tags_tag ON book_tags(tag_id);

-- Video sections for vector search testing
CREATE TABLE video_sections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  status            TEXT DEFAULT 'draft',
  vision_embedding  vector(3),  -- Small dimension for testing
  text_embedding    vector(3),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Products table for JSONB testing
CREATE TABLE products (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     TEXT NOT NULL,
  metadata JSONB,
  tags     JSONB,
  settings JSONB
);

-- Users table for JSONB testing
CREATE TABLE users (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email    TEXT NOT NULL,
  profile  JSONB,
  preferences JSONB
);

-- Vector indexes for similarity search performance
-- NOTE: Commented out for tests as ivfflat requires more data to work properly
-- CREATE INDEX IF NOT EXISTS idx_video_sections_vision ON video_sections USING ivfflat (vision_embedding vector_cosine_ops);
-- CREATE INDEX IF NOT EXISTS idx_video_sections_text ON video_sections USING ivfflat (text_embedding vector_cosine_ops);
