/**
 * Shared types used across all SDK operations
 */

/**
 * Paginated response structure returned by list operations
 * @template T - The type of records in the data array
 */
export interface PaginatedResponse<T> {
  /** Array of records for the current page */
  data: T[];
  /** Total number of records matching the query (across all pages) */
  total: number;
  /** Maximum number of records per page */
  limit: number;
  /** Number of records skipped (for pagination) */
  offset: number;
  /** Whether there are more records available after this page */
  hasMore: boolean;
}
