# Changelog

## 2025-11-11

- feat: Add type-safe WHERE clause filtering with advanced operators
  - Added 12 operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $like, $ilike, $is, $isNot
  - Full TypeScript type safety - only valid operators for each field type are allowed
  - Works with list() endpoints and include methods
  - Comprehensive documentation generated in SDK contract
- feat: Generate where-types.ts with type utilities for WHERE clauses
  - WhereOperator<T> type for all supported operators
  - WhereCondition<T> union type for direct values or operator objects
  - Where<T> mapped type for complete WHERE clause typing
- refactor: Improve config template with better structure and examples
  - Added quick start section with CLI commands
  - Better organized sections with clearer comments
  - More comprehensive examples for auth and pull configuration
- chore: Add Docker test setup automation
  - Auto-start PostgreSQL container if not running
  - Wait for DB readiness before running tests
  - Better test reliability across environments
