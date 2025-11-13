# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- feat: Add multi-column sorting support to list operations
  - `orderBy` now accepts single column or array of columns
  - `order` now accepts single direction or array of directions (one per column)
  - Columns validated via Zod enum at route level for type safety
  - Examples: `{ orderBy: ["status", "created_at"], order: ["asc", "desc"] }`
  - Works with WHERE clauses and include methods
  - Generated SDK contract includes comprehensive sorting documentation and examples

## [v0.11.0] - 2025-11-12

- feat: Add onRequest hook for request-level middleware
  - Enables setting PostgreSQL session variables for audit logging and RLS
  - Hook receives Hono context and pg client for type-safe access
  - Runs before each endpoint operation (create, read, update, delete, list)
  - Fully backward compatible - router works with or without the hook
  - Example use case: Setting `app.user_id` session variable from JWT claims

## [v0.10.4] - 2025-11-11

- feat: Export table types from client SDK index
  - `Insert<Table>`, `Update<Table>`, and `Select<Table>` types now exported from client index
  - Enables importing types directly from SDK without navigating to individual type files
  - Improves developer experience for TypeScript users

## [v0.10.1] - 2025-11-11

- feat: Add $or and $and logical operators to WHERE clauses
  - Build complex queries with OR logic: `{ $or: [{ status: 'active' }, { role: 'admin' }] }`
  - Combine with AND: `{ status: 'active', $or: [{ age: { $lt: 18 } }, { age: { $gt: 65 } }] }`
  - Support nesting up to 2 levels deep for complex filtering patterns
  - All 12 existing operators work inside $or/$and conditions
  - Comprehensive test coverage with real-world scenarios
- refactor: Add auto-generated file headers to all emitted files
  - Clear warning that files are auto-generated and should not be edited manually
  - Directs users to modify schema/config and regenerate instead
- docs: Expand WHERE clause examples in README
  - Add OR logic examples with multiple conditions
  - Show complex AND/OR combinations
  - Include nested logic patterns
- chore: Add MIT license file
- chore: Add repository metadata to package.json
  - Author, repository URL, homepage, and bug tracker links
- chore: Ignore .claude/settings.local.json from version control
  - Developer-specific Claude Code settings should not be committed

## [v0.10.0] - 2025-11-11

- feat: Add type-safe WHERE clause filtering with advanced operators
  - Added 12 operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $like, $ilike, $is, $isNot
  - Full TypeScript type safety - only valid operators for each field type are allowed
  - Works with list() endpoints and include methods
  - Comprehensive documentation generated in SDK contract
- feat: Generate where-types.ts with type utilities for WHERE clauses
  - WhereOperator<T> type for all supported operators
  - WhereCondition<T> union type for direct values or operator objects
  - Where<T> mapped type for complete WHERE clause typing
- feat: Export IncludeSpec types from SDK for advanced usage
  - Allows building complex include specifications outside SDK methods
  - Useful for dynamic query builders and custom abstractions
- refactor: Reorganize project structure and clean up tests
  - Moved validation examples to examples/ directory for better discoverability
  - Removed obsolete test files that tested old patterns
  - Added test cleanup before runs to prevent stale data issues
  - Updated drizzle-e2e config to use current config format
- refactor: Improve config template with better structure and examples
  - Added quick start section with CLI commands
  - Better organized sections with clearer comments
  - More comprehensive examples for auth and pull configuration
- chore: Add Docker test setup automation
  - Auto-start PostgreSQL container if not running
  - Wait for DB readiness before running tests
  - Better test reliability across environments
- chore: Add Claude Code configuration and workflow guidelines

## [v0.9.9] - 2025-08-20

- fix: Add WHERE clause support to list endpoint and include methods
  - WHERE clause filtering now works correctly across all list operations
  - Include methods properly pass through WHERE conditions

## [v0.9.8] - 2025-08-19

- fix: Preserve complex config blocks during merge
  - Interactive merge now correctly handles multi-line config blocks
  - Prevents corruption of auth, include, and other complex configurations

## [v0.9.7] - 2025-08-19

- fix: Set includeMethodsDepth default to 2 in gen.config.ts
  - Default depth now matches documentation and expected behavior
- refactor: Eliminate includeDepthLimit naming confusion
  - Standardized on includeMethodsDepth throughout codebase
  - Removed legacy naming variations for clarity

## [v0.9.6] - 2025-08-19

- feat: Add interactive merge process for existing postgresdk.config.ts
  - When config file exists, prompt user to merge or replace
  - Intelligently merges new schema with existing configuration
  - Preserves custom auth, include rules, and other user settings

## [v0.9.5] - 2025-08-19

- fix: Build system improvements
  - Fixed build errors in distribution
  - Updated build configuration for better reliability

## [v0.9.3] - 2025-08-19

- feat: Generate multiple depth-1 include methods
  - Generate explicit methods for each relationship at first level
  - Enables `listWithAuthor()`, `listWithTags()` patterns
  - Better TypeScript inference for included relationships

## [v0.9.2] - 2025-08-19

- feat: Include API contract in generated SDK
  - SDK now includes complete API documentation
  - Generated contract shows all available endpoints and types
  - Improves discoverability of SDK capabilities

## [v0.9.1] - 2025-08-19

- refactor: Update contract emission format
  - Improved structure and formatting of generated contracts
  - Better documentation in emitted contract files

## [v0.9.0] - 2025-08-19

- feat: Add bidirectional foreign key relationships
  - Automatically detect and generate both sides of FK relationships
  - Parent tables can now include child collections
  - Child tables can include parent records
  - Enables more flexible data fetching patterns
