# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- feat: Add idempotent generation and pull operations
  - `postgresdk generate` now skips regeneration when schema unchanged
  - `postgresdk pull` only writes files that changed
  - Schema hash computed from database schema and config settings
  - Cache stored in `.postgresdk/` directory (auto-added to .gitignore)
  - History log tracks all generation and pull operations with timestamps
  - Files written only if content differs from existing files
  - Reduces unnecessary file writes and git churn
- refactor: Remove timestamps from SDK manifest and contract
  - Removed `generated` field from SDK manifest for deterministic builds
  - Removed `generatedAt` field from unified contract
  - Enables idempotent generation - same schema produces identical output
  - Improves caching and build reproducibility
- chore: Update devcontainer to use official Claude CLI installer
  - Switched from bun global install to curl-based installer
  - Uses official install script from claude.ai

## [v0.16.14] - 2026-01-19

- fix: Add NoInfer to prevent type inference bugs with optional fields in JSONB tables
  - Generic parameters on `create()` and `update()` methods now use `NoInfer<>` to prevent TypeScript from inferring types from data parameters
  - Fixes critical bug where wrong field names (e.g., `status` instead of `job_status`) would pass type checking when optional fields exist
  - TypeScript now correctly rejects objects with incorrect field names even when JSONB columns are present
  - Example: `client.create({ status: "queued" })` now fails at compile time with proper error message
  - Requires TypeScript 5.4+ (NoInfer utility type)
- refactor: Replace `any` with `unknown` for BaseClient HTTP method body parameters
  - Changed `body?: any` to `body?: unknown` in `post()` and `patch()` methods
  - Improves type safety and follows project coding standards
  - No breaking changes - all existing code continues to work
- test: Add NoInfer type safety test to verify fix prevents wrong field name inference

## [v0.16.13] - 2026-01-16

- feat: Add `numericMode` config option for flexible numeric type mapping
  - New option controls how PostgreSQL numeric types map to TypeScript
  - `"auto"` mode (default): int2/int4/floats → `number`, int8/numeric → `string` for precision safety
  - `"number"` mode: All numeric types → `number` (unsafe for values > 2^53)
  - `"string"` mode: All numeric types → `string` (legacy behavior, safe but requires parsing)
  - Auto mode provides JavaScript-safe integers as numbers while preserving bigint/arbitrary precision as strings
  - Applied to both TypeScript types and Zod validation schemas
  - Fully documented in config templates, README, and CLI init output

## [v0.16.12] - 2026-01-15

- feat: Add include options to `listWith*` and `getByPkWith*` methods
  - Generated include methods now accept optional parameters to control included relations
  - Support for `orderBy`, `order`, `limit`, and `offset` on nested includes
  - Works with single includes (`listWithBooks({ booksInclude: { orderBy, limit } })`)
  - Works with parallel includes (`listWithAuthorAndTags({ tagsInclude: { ... } })`)
  - Works with nested includes (`listWithBooksAndTags({ booksInclude: { include: { tags: { ... } } } })`)
  - Backwards compatible - calling without options works as before
  - All parameters fully typed with no loss of type safety
- test: Add comprehensive tests for include method options
  - 8 new tests covering single, parallel, and nested include patterns
  - Tests verify orderBy, limit, offset, and combinations work correctly
  - All existing tests continue to pass
- chore: Run build and tests before version bump in publish script
  - Version only updated after successful build and test run
  - Prevents package.json modification when build/test fails
  - Switched to bun commands per project standards

## [v0.16.10] - 2026-01-14

- fix: Improve TypeScript intellisense for JSONB generic types
  - Generic types now display actual properties instead of index signatures in IDE hover
  - When no generic provided, returns base type directly instead of `Omit<Base, never>`
  - Fixes confusing `{ [x: string]: ...; }` display in autocomplete and type hints
  - Applies to `Insert`, `Update`, and `Select` types for tables with JSONB columns

## [v0.16.9] - 2026-01-13

- fix: Handle empty arrays correctly in $in and $nin operators
  - Empty $in array now returns no results (FALSE condition) instead of being ignored
  - Empty $nin array is skipped (matches everything) instead of being ignored
  - Prevents unexpected behavior when filtering with empty arrays
- refactor: Remove unnecessary parameter preparation in list operations
  - Simplified query execution by passing params directly to pg.query
  - No behavior change, just cleaner code

## [v0.16.8] - 2026-01-13

- feat: Add pullToken to interactive config merge workflow
  - `postgresdk init` interactive merge now includes pullToken as an option
  - Config extraction logic recognizes pullToken field for preservation during updates
  - Generated configs include pullToken documentation and env var syntax examples
- fix: Improve error messages for pull token authentication failures
  - CLI now shows detailed error messages from server when pull fails due to auth
  - Server returns helpful message when pullToken env var not set
  - Includes environment variable name in error message for easier debugging

## [v0.16.7] - 2026-01-13

- feat: Add pull token authentication for SDK distribution endpoints
  - New `pullToken` config option protects `/_psdk/*` endpoints (SDK manifest, download, files)
  - Supports `"env:VAR_NAME"` syntax for reading token from environment variables
  - When set, clients must provide matching token via Authorization header when running `postgresdk pull`
  - Separate from main auth strategy (JWT/API key) used for CRUD operations
  - Endpoints are public if pullToken not configured
- fix: Vector columns now return as typed number arrays instead of strings
  - pgvector columns (vector, halfvec, sparsevec, bit) now parsed from PostgreSQL string format to number[]
  - Applies to all operations: create, getByPk, list, update, delete
  - TypeScript types correctly reflect number[] for vector fields
  - Fixes type mismatch where vectors returned as strings despite TypeScript expecting arrays
- docs: Update configuration examples for pull token usage
  - README and example.config.ts show pullToken configuration
  - CLI init command includes POSTGRESDK_PULL_TOKEN in environment variable examples
  - Renamed `pull.token` to `pull.pullToken` for consistency

## [v0.16.6] - 2026-01-12

- fix: Explicitly stringify JSONB parameters for PostgreSQL queries
  - All database operations now stringify objects/arrays before passing to pg library
  - Fixes edge cases where pg fails to auto-stringify JSONB values
  - Ensures consistent JSONB handling across create, update, list, getByPk, and delete operations
- chore: Add JSONB integration tests to test suite
  - Tests verify JSONB objects, arrays, nested structures, and null values work end-to-end
  - Covers create, retrieve, update operations with various JSONB types
  - Test schema includes products and users tables with multiple JSONB columns

## [v0.16.5] - 2026-01-12

- chore: Add enhanced error logging for JSON validation failures
  - Create/update/list operations now detect and log detailed info for invalid JSON input
  - Logs include input data, PostgreSQL error message, and operation context
  - Helps debug type mismatches between TypeScript and PostgreSQL JSONB validation
- chore: Add comprehensive JSONB arrays and primitives tests
  - Tests verify JSONB columns can store arrays, primitives, and objects
  - Validates array query operators ($jsonbContains) work with pure arrays
  - Compile-time tests ensure TypeScript types work with array overrides
  - Covers empty arrays, primitives (string/number/boolean/null), and nested structures
- chore: Exclude test output directories from TypeScript compilation
  - Prevents IDE performance issues from scanning large generated test files
  - Removes test-specific compile errors from project-wide type checking

## [v0.16.4] - 2026-01-12

- refactor: Conditionally generate generic client methods for JSONB tables only
  - Client methods (create, update, delete, list, getByPk) only generic when table has JSONB columns
  - Non-JSONB tables get simple non-generic methods for cleaner generated code
  - Reduces type complexity and improves IDE performance for simple tables
  - JSONB tables retain full generic type support with optional type parameter
- refactor: Simplify JSONB generic types with built-in generics
  - Base types (`Insert`, `Update`, `Select`) are now generic for tables with JSONB columns
  - Removed `MergeJsonb` helper type and method overloads for cleaner API
  - Usage: `InsertProduct<{ metadata: MyMetadataType }>` instead of `MergeJsonb<InsertProduct, { metadata: MyMetadataType }>`
  - All CRUD methods accept optional generic parameter defaulting to empty object
  - Non-JSONB tables generate simple non-generic types (no unnecessary complexity)
- refactor: Replace `Record<string, any>` with type-safe `JsonValue` for JSONB columns
  - JSONB/JSON columns now use recursive `JsonValue` type instead of loose `any`
  - Improves type safety while maintaining flexibility for nested JSON structures
  - `JsonValue` supports string, number, boolean, null, arrays, and nested objects
- chore: Add comprehensive JSONB type safety tests
  - Runtime tests verify generic types work with Insert/Update/Select
  - Compile-time tests verify TypeScript catches type errors
  - Tests cover nested objects, arrays, nullable fields, partial overrides, and union types

## [v0.16.2] - 2026-01-12

- refactor: Conditionally generate vector types based on table schema
  - Vector overloads and schemas only generated for tables with vector columns
  - Expanded vector type detection to support halfvec, sparsevec, and bit types
  - Cleaner TypeScript types for non-vector tables (no unused vector parameters)
  - Debug logging available via SDK_DEBUG env var for troubleshooting vector detection
- docs: Add JSONB and vector search to generated SDK contract
  - JSONB operators included in operator reference table
  - Vector search section with similarity search examples
  - Vector type properly mapped in field type documentation

## [v0.16.0] - 2026-01-12

- feat: Add JSONB query operators for PostgreSQL JSON columns
  - Added `$jsonbContains` operator for containment checks (`@>`)
  - Added `$jsonbContainedBy` operator for reverse containment (`<@`)
  - Added `$jsonbHasKey`, `$jsonbHasAnyKeys`, `$jsonbHasAllKeys` for key existence checks
  - Added `$jsonbPath` operator for querying nested values with deep path traversal
  - Supports equality, comparison, and pattern matching operators on nested paths
  - All operators work with existing `$and`/`$or` logical operators
  - TypeScript types restrict JSONB operators to object/unknown columns only
  - Full integration test coverage for all JSONB operators
- feat: Add pgvector similarity search support
  - Automatically detects vector columns during introspection
  - Extracts vector dimensions from PostgreSQL type metadata
  - Added `vector` parameter to list operations with field, query, metric, and maxDistance options
  - Supports three distance metrics: cosine (default), L2, and inner product
  - Returns `_distance` field in results ordered by similarity
  - Optional `maxDistance` threshold for filtering results
  - Hybrid search: combine vector similarity with traditional WHERE filters
  - Parallel multi-modal search across multiple vector fields (vision + text embeddings)
  - Auto-excludes NULL embeddings from vector search results
  - Full integration test coverage with pgvector Docker image
- feat: Add JSONB type generics to client SDK methods
  - All CRUD methods now support type parameter for JSONB field overrides
  - Enables type-safe JSONB queries: `list<{ metadata: Metadata }>({ where: ... })`
  - Introduced `MergeJsonb<TBase, TJsonb>` helper type for combining base types with JSONB overrides
  - JSDoc examples demonstrate usage patterns
  - Overloaded method signatures preserve backward compatibility
- docs: Document 1000 record pagination limit in README
  - Added note in Filtering & Pagination section clarifying max limit per request
  - Aligns documentation with v0.15.5 server-side validation change
- docs: Add JSONB query examples to README
  - Show all JSONB operators with practical examples
  - Demonstrate type-safe JSONB with TypeScript generics
  - Include examples of combining JSONB operators with `$and`/`$or`
- docs: Add vector search documentation to README
  - Comprehensive examples for basic similarity search, distance thresholds, hybrid search
  - Show parallel multi-modal search pattern (vision + text embeddings)
  - Document all three distance metrics with use cases
  - Explain NULL embedding handling and auto-exclusion behavior

## [v0.15.6] - 2026-01-05

- refactor: Simplify auth config by inferring strategy from configuration
  - Removed explicit `strategy` field from auth config (breaking change)
  - Strategy now automatically inferred: `jwt` object → "jwt-hs256", `apiKeys` array → "api-key", neither → "none"
  - Added `getAuthStrategy()` helper function for consistent strategy detection
  - Simplified `normalizeAuthConfig()` to handle shorthand syntax without explicit strategy
  - Updated all examples, tests, and documentation to remove strategy field
  - Migration: Remove `strategy: "api-key"` or `strategy: "jwt-hs256"` lines from auth config

## [v0.15.5] - 2026-01-02

- fix: Increase max pagination limit to 1000 for consistency
  - Server-side validation now accepts up to 1000 records per request (was 100)
  - Client-side validation already allowed 1000, causing runtime errors when using limits 101-1000
  - Both client and server now consistently enforce max limit of 1000

## [v0.15.4] - 2026-01-02

- feat: Add `init pull` subcommand for pull-only config generation
  - Run `postgresdk init pull` to create config with only `pull` section
  - Alias for `init --sdk` with more intuitive naming
  - Improved error message when running `pull` without config - suggests `init pull`

## [v0.15.3] - 2026-01-02

- fix: Support direct nested includes without explicit wrapper syntax
  - Nested includes now work with clean syntax: `{ books: { tags: true } }`
  - Removed requirement for verbose wrapper: `{ books: { include: { tags: true } } }`
  - Fixes bug where nested relationships were silently ignored
  - Example: `include: { recording_job: { configuration_set: true } }` now correctly loads nested data
  - Breaking: Old explicit `.include` wrapper syntax no longer supported (clean up your include specs)
- docs: Use `@latest` pattern instead of global installation
  - All commands now use `npx postgresdk@latest`, `bunx postgresdk@latest`, or `pnpm dlx postgresdk@latest`
  - Removed installation instructions - no need to install globally or as dev dependency
  - Users always run latest version automatically
  - Matches modern CLI tool best practices (Vite, Next.js, etc.)

## [v0.15.2] - 2025-12-31

- fix: Remove unused BaseClient import from generated client index
  - Generated index.ts now only imports AuthConfig as a type
  - Eliminates TypeScript unused import errors when using strict noUnusedLocals flag
  - BaseClient still properly re-exported via direct export statement

## [v0.15.1] - 2025-12-31

- fix: Prevent JWT secrets from being hardcoded in generated code
  - Generator now validates that JWT secrets use `"env:VAR_NAME"` pattern in config
  - Rejects configs with hardcoded secrets or `process.env.X` references (which evaluate at generation time)
  - Converts `"env:JWT_SECRET"` to `process.env.JWT_SECRET` in generated auth.ts file
  - Secrets now resolved at API server startup instead of during code generation
  - Eliminates risk of committing secrets to version control in generated files
  - Updated example.config.ts and types.ts with security warnings and correct patterns
  - Added tests to verify hardcoded secrets are rejected and process.env references are generated

## [v0.14.5] - 2025-12-31

- feat: Add SDK pull instructions to post-generation output
  - Shows how to pull SDK in separate client apps using CLI or config file
  - Replaces hardcoded localhost URLs with placeholder in usage examples
  - Helps developers understand SDK distribution model after generation

## [v0.14.4] - 2025-12-31

- fix: Prevent duplicate include method generation in client SDK
  - Deduplicates methods by name when nested paths and combinations produce identical method signatures
  - Resolves TypeScript "Duplicate function implementation" errors in generated client code
  - Keeps first occurrence when multiple generation paths create the same method name
- fix: Allow optional JWT secret in generated auth code
  - JWT service type now accepts optional `secret` field to support environment variable references
  - Resolves TypeScript type mismatch errors when JWT config uses `env:VAR_NAME` syntax
  - Generated auth.ts properly handles secrets resolved at runtime from environment
- docs: Fix hardcoded paths in README to reflect configurable outDir
  - Removed hardcoded `api/server/sdk-bundle.ts` reference (outDir is configurable)
  - Added note that code examples use default paths and should be adjusted for custom outDir
  - Added inline comments in Quick Start to clarify import paths depend on configuration
- docs: Reorganize README for better flow and discoverability
  - Restructured into clear sections: Getting Started, API Server Setup, Client SDK, Reference
  - Moved Installation before Quick Start (logical progression)
  - Grouped server concerns together (Configuration, Database Drivers, Server Integration, Authentication, Deployment)
  - Moved SDK Distribution and Usage to dedicated Client SDK section
  - Relocated CLI Commands, Tests, Requirements to Reference section at end
  - Added section dividers to improve visual navigation
  - Preserves all existing content and examples
- docs: Add service-to-service authorization guide
  - Documents JWT claims-based authorization pattern using `onRequest` hook
  - Explains why token claims are preferred over config-based scopes (follows OAuth2/OIDC standards, dynamic permissions, flexible authorization)
  - Includes examples for table-level, row-level (RLS), and field-level authorization
  - Shows advanced patterns like read-only services and time-based restrictions
- docs: Expand SDK distribution documentation
  - Clarifies how SDK bundling works (files embedded in server, served via HTTP endpoints)
  - Documents SDK endpoints: `/_psdk/sdk/manifest`, `/_psdk/sdk/download`, `/_psdk/sdk/files/:path`
  - Adds step-by-step client integration workflow (install postgresdk, pull SDK, use types)
  - Shows both Bun and npm usage examples for pull command
  - Emphasizes config file approach as recommended practice

## [v0.14.3] - 2025-12-31

- fix: Show helpful error when config file is missing
  - `postgresdk generate` now checks if config file exists before attempting to load it
  - Displays clear error message suggesting to run `postgresdk init` first
  - Replaces cryptic `ERR_MODULE_NOT_FOUND` error with actionable guidance

## [v0.14.2] - 2025-12-31

### BREAKING CHANGES

- feat: Replace single-secret JWT auth with multi-service authentication
  - JWT config now requires `services` array with per-service issuer and secret
  - Each service identified by its `iss` claim and verified with its own secret
  - Enables true service isolation - compromising one service doesn't affect others
  - API automatically selects correct secret based on JWT issuer claim
  - Migration: Replace `jwt: { sharedSecret: "...", issuer: "..." }` with `jwt: { services: [{ issuer: "service-name", secret: "..." }] }`
  - Issuer claim now required in all JWTs (tokens missing `iss` are rejected)

### Chores

- chore: Fix publish script to build before testing
  - Moved build step before test step to ensure dist files are up-to-date
  - Tests now run against fresh build that matches generated code
  - Prevents test failures from stale dist files during publish workflow
  - Removed duplicate rebuild step

### BREAKING CHANGES

- refactor: Simplify output directory configuration with unified `outDir`
  - Replace separate `outServer` and `outClient` config fields with single `outDir` option
  - Supports simple usage: `outDir: "./api"` (uses same directory for both)
  - Supports separate paths: `outDir: { client: "./sdk", server: "./api" }`
  - Migration: Update config from `{ outServer: "./api/server", outClient: "./api/client" }` to `{ outDir: { server: "./api/server", client: "./api/client" } }`
  - All test configs and example configs updated to new format
- refactor: Move special endpoints to `/_psdk` prefix for better organization
  - SDK distribution endpoints moved from `/sdk/*` to `/_psdk/sdk/*`
  - Contract endpoints moved from `/api/contract*` to `/_psdk/contract*`
  - Prevents collision with user data routes
  - Endpoints: `/_psdk/sdk/manifest`, `/_psdk/sdk/download`, `/_psdk/contract`, `/_psdk/contract.json`, `/_psdk/contract.md`
  - Migration: Update pull config or SDK fetching code to use new `/_psdk/*` paths

### Features

- feat: Add configurable API path prefix via `apiPathPrefix` option
  - Control URL prefix for all data table routes (default: `/v1`)
  - Examples: `"/v1"` → `/v1/users`, `""` → `/users`, `"/api/v2"` → `/api/v2/users`
  - Special `/_psdk/*` endpoints unaffected by this setting
- feat: Enhance `postgresdk init` with project type selection
  - Added `--api` flag for API-side config (database introspection and generation)
  - Added `--sdk` flag for SDK-side config (consuming remote SDK via pull)
  - Interactive prompt if no flag provided
  - Generates appropriate config template based on project type
  - Tailored next steps and documentation for each use case

### Documentation

- docs: Add Bun runtime examples throughout README
  - Added installation examples: `bun install -g postgresdk`, `bunx postgresdk`
  - Added CLI command examples with Bun alternatives
  - Documented Bun test framework option: `bun test`
- docs: Enhance CLI documentation in README
  - Document new `--api` and `--sdk` flags for init command
  - Show interactive vs flag-based initialization workflows
  - Improve clarity of init command usage
- docs: Improve generated code usage examples
  - Show clear separation between server setup and client SDK usage
  - Add file path examples relative to project root

## [v0.13.1] - 2025-11-14

- refactor: Add shared PaginatedResponse type for type safety
  - Introduced `PaginatedResponse<T>` generic type exported from SDK
  - Replaces inline pagination type definitions with reusable type
  - Improves type consistency across all list methods
  - Available as `import type { PaginatedResponse } from './client'`

## [v0.13.0] - 2025-11-14

### BREAKING CHANGES

- feat: Add pagination metadata to list operations
  - `list()` methods now return `{ data: T[], total: number, limit: number, offset: number, hasMore: boolean }` instead of `T[]`
  - Enables calculating total pages: `Math.ceil(result.total / result.limit)`
  - Enables calculating current page: `Math.floor(result.offset / result.limit) + 1`
  - `hasMore` flag indicates if more pages are available
  - Applies to all list methods including include methods (e.g., `listWithAuthor()`, `listWithBooks()`)
  - Migration: Update code from `const items = await sdk.table.list()` to `const items = (await sdk.table.list()).data`
  - COUNT query automatically respects WHERE clauses for accurate totals
- docs: Add JSDoc documentation to generated SDK client methods
  - All CRUD methods now include parameter descriptions and return types
  - Include methods document relationship paths and nested data structure
  - Type definitions explain Insert, Update, and Select types
  - Improves IDE autocomplete and developer experience
- refactor: Convert core operations from static template to generated code
  - Core operations now generated via `emitCoreOperations()` for consistency
  - Removed `src/core/operations.ts` template file (operations still generated to output directory)
  - No user-facing changes - purely internal restructuring
- chore: Update generated tests for pagination metadata
  - Generated test files now validate pagination structure (data, total, hasMore)
  - Tests verify list operations return correct metadata format

## [v0.12.1] - 2025-11-14

- feat: Add PostgreSQL enum type support
  - Introspect enum types from database schema
  - Generate TypeScript union types for enums (e.g., `"admin" | "user" | "guest"`)
  - Generate Zod schemas using `z.enum()` instead of `z.string()` for proper validation
  - Support nullable enum columns with proper type inference
  - Support array of enum values with correct TypeScript and Zod typing
  - Runtime validation ensures only valid enum values are accepted
  - SDK contract documentation includes enum types in field descriptions and query parameters
- chore: Enhance test coverage for compound sorting with mixed directions
  - Add validation tests for `[DESC, ASC]` direction combinations
  - Add validation tests for `[DESC, DESC]` direction combinations
  - Verify correct SQL generation and result ordering for all direction permutations

## [v0.12.0] - 2025-11-13

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
