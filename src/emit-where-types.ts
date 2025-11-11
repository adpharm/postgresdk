/**
 * Emits WHERE clause type utilities for type-safe filtering
 */

export function emitWhereTypes() {
  return `/* Generated. Do not edit. */

/**
 * WHERE clause operators for filtering
 */
export type WhereOperator<T> = {
  /** Equal to */
  $eq?: T;
  /** Not equal to */
  $ne?: T;
  /** Greater than */
  $gt?: T;
  /** Greater than or equal to */
  $gte?: T;
  /** Less than */
  $lt?: T;
  /** Less than or equal to */
  $lte?: T;
  /** In array */
  $in?: T[];
  /** Not in array */
  $nin?: T[];
  /** LIKE pattern match (strings only) */
  $like?: T extends string ? string : never;
  /** Case-insensitive LIKE (strings only) */
  $ilike?: T extends string ? string : never;
  /** IS NULL */
  $is?: null;
  /** IS NOT NULL */
  $isNot?: null;
};

/**
 * WHERE condition - can be a direct value or an operator object
 */
export type WhereCondition<T> = T | WhereOperator<T>;

/**
 * WHERE clause type for a given table type
 */
export type Where<T> = {
  [K in keyof T]?: WhereCondition<T[K]>;
};
`;
}
