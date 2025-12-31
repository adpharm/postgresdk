# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
