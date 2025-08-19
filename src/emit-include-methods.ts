import type { Table } from "./introspect";
import type { Graph, Edge } from "./rel-classify";
import { pascal } from "./utils";

export type IncludeMethod = {
  name: string;
  path: string[];
  isMany: boolean[];
  targets: string[];
  returnType: string;
  includeSpec: any;
};

/**
 * Check if a table is a junction table (only has foreign keys)
 */
function isJunctionTable(table: Table): boolean {
  // Junction tables typically have only FKs and maybe an ID
  // They also often follow naming pattern table1_table2
  if (!table.name.includes("_")) return false;
  
  // Check if all non-PK columns are part of FKs
  const fkColumns = new Set(table.fks.flatMap(fk => fk.from));
  const nonPkColumns = table.columns.filter(c => !table.pk.includes(c.name));
  
  return nonPkColumns.every(c => fkColumns.has(c.name));
}

/**
 * Convert a path array to a method name suffix
 * ["author"] -> "WithAuthor"
 * ["author", "books"] -> "WithAuthorAndBooks"
 */
function pathToMethodSuffix(path: string[]): string {
  return "With" + path.map(p => pascal(p)).join("And");
}

/**
 * Build the return type for a given path
 */
function buildReturnType(
  baseTable: string,
  path: string[],
  isMany: boolean[],
  targets: string[],
  graph: Graph
): string {
  const BaseType = `Select${pascal(baseTable)}`;
  
  if (path.length === 0) return BaseType;
  
  // Build nested type
  let type = BaseType;
  let currentTable = baseTable;
  
  const parts: string[] = [];
  for (let i = 0; i < path.length; i++) {
    const key = path[i];
    const target = targets[i];
    if (!key || !target) continue; // Skip invalid entries
    
    const targetType = `Select${pascal(target)}`;
    
    if (i === 0) {
      // First level
      parts.push(`${key}: ${isMany[i] ? `${targetType}[]` : targetType}`);
    } else {
      // Nested levels - need to build the nested structure
      let nestedType = targetType;
      for (let j = i; j < path.length; j++) {
        if (j > i) {
          const nestedKey = path[j];
          const nestedTarget = targets[j];
          if (!nestedKey || !nestedTarget) continue;
          const nestedTargetType = `Select${pascal(nestedTarget)}`;
          nestedType = `${nestedType} & { ${nestedKey}: ${isMany[j] ? `${nestedTargetType}[]` : nestedTargetType} }`;
        }
      }
      // Update the previous part
      const prevKey = path[i-1];
      const prevTarget = targets[i-1];
      if (prevKey && prevTarget) {
        parts[parts.length - 1] = `${prevKey}: ${isMany[i-1] ? `(Select${pascal(prevTarget)} & { ${key}: ${isMany[i] ? `${targetType}[]` : targetType} })[]` : `Select${pascal(prevTarget)} & { ${key}: ${isMany[i] ? `${targetType}[]` : targetType} }`}`;
      }
      break; // We've handled the rest
    }
  }
  
  return `${type} & { ${parts.join("; ")} }`;
}

/**
 * Build include spec object for a path
 */
function buildIncludeSpec(path: string[]): any {
  if (path.length === 0) return {};
  if (path.length === 1) return { [path[0]!]: true };
  
  // Build nested spec
  let spec: any = true;
  for (let i = path.length - 1; i > 0; i--) {
    const key = path[i];
    if (!key) continue;
    spec = { [key]: spec };
  }
  const rootKey = path[0];
  return rootKey ? { [rootKey]: spec } : {};
}

/**
 * Generate all include methods for a table
 */
export function generateIncludeMethods(
  table: Table,
  graph: Graph,
  opts: { 
    maxDepth: number;
    skipJunctionTables: boolean;
  },
  allTables?: Table[]
): IncludeMethod[] {
  const methods: IncludeMethod[] = [];
  const baseTableName = table.name;
  
  // Skip if junction table and configured to skip
  if (opts.skipJunctionTables && isJunctionTable(table)) {
    return methods;
  }
  
  const edges = graph[baseTableName] || {};
  
  /**
   * Recursively explore relationships
   */
  function explore(
    currentTable: string,
    path: string[],
    isMany: boolean[],
    targets: string[],
    visited: Set<string>,
    depth: number
  ) {
    if (depth > opts.maxDepth) return;
    
    const currentEdges = graph[currentTable] || {};
    
    for (const [key, edge] of Object.entries(currentEdges)) {
      // Skip if we've seen this table (circular reference)
      if (visited.has(edge.target)) continue;
      
      // Skip junction tables if configured
      if (opts.skipJunctionTables && allTables) {
        const targetTable = allTables.find(t => t.name === edge.target);
        if (targetTable && isJunctionTable(targetTable)) {
          continue;
        }
      }
      
      const newPath = [...path, key];
      const newIsMany = [...isMany, edge.kind === "many"];
      const newTargets = [...targets, edge.target];
      const methodSuffix = pathToMethodSuffix(newPath);
      
      // Add list method
      methods.push({
        name: `list${methodSuffix}`,
        path: newPath,
        isMany: newIsMany,
        targets: newTargets,
        returnType: `(${buildReturnType(baseTableName, newPath, newIsMany, newTargets, graph)})[]`,
        includeSpec: buildIncludeSpec(newPath)
      });
      
      // Add getByPk method
      methods.push({
        name: `getByPk${methodSuffix}`,
        path: newPath,
        isMany: newIsMany,
        targets: newTargets,
        returnType: `${buildReturnType(baseTableName, newPath, newIsMany, newTargets, graph)} | null`,
        includeSpec: buildIncludeSpec(newPath)
      });
      
      // Recurse for deeper levels
      explore(
        edge.target,
        newPath,
        newIsMany,
        newTargets,
        new Set([...visited, edge.target]),
        depth + 1
      );
    }
    
    // Generate combinations for current depth level
    if (depth === 1 && Object.keys(currentEdges).length > 1 && Object.keys(currentEdges).length <= 3) {
      // Only generate combinations for 2-3 relationships at depth 1
      const edgeEntries = Object.entries(currentEdges);
      
      // Generate pairs
      if (edgeEntries.length >= 2) {
        for (let i = 0; i < edgeEntries.length - 1; i++) {
          for (let j = i + 1; j < edgeEntries.length; j++) {
            const entry1 = edgeEntries[i];
            const entry2 = edgeEntries[j];
            if (!entry1 || !entry2) continue;
            
            const [key1, edge1] = entry1;
            const [key2, edge2] = entry2;
            
            // Skip if either is a junction table
            if (opts.skipJunctionTables && (edge1.target.includes("_") || edge2.target.includes("_"))) {
              continue;
            }
            
            const combinedPath = [key1, key2];
            const combinedSuffix = `With${pascal(key1)}And${pascal(key2)}`;
            const type1 = `${key1}: ${edge1.kind === "many" ? `Select${pascal(edge1.target)}[]` : `Select${pascal(edge1.target)}`}`;
            const type2 = `${key2}: ${edge2.kind === "many" ? `Select${pascal(edge2.target)}[]` : `Select${pascal(edge2.target)}`}`;
            
            methods.push({
              name: `list${combinedSuffix}`,
              path: combinedPath,
              isMany: [edge1.kind === "many", edge2.kind === "many"],
              targets: [edge1.target, edge2.target],
              returnType: `(Select${pascal(baseTableName)} & { ${type1}; ${type2} })[]`,
              includeSpec: { [key1]: true, [key2]: true }
            });
            
            methods.push({
              name: `getByPk${combinedSuffix}`,
              path: combinedPath,
              isMany: [edge1.kind === "many", edge2.kind === "many"],
              targets: [edge1.target, edge2.target],
              returnType: `(Select${pascal(baseTableName)} & { ${type1}; ${type2} }) | null`,
              includeSpec: { [key1]: true, [key2]: true }
            });
          }
        }
      }
    }
  }
  
  // Start exploration
  explore(baseTableName, [], [], [], new Set([baseTableName]), 1);
  
  return methods;
}