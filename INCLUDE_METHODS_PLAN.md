# Plan: Generate Explicit Include Methods

## Goal
Generate explicit SDK methods like `listWithAuthor()` and `listWithTags()` instead of using dynamic includes. Each method has a concrete return type with the included relationships.

## Core Algorithm

### 1. Method Generation Rules
- Generate methods for each relationship at depth 1
- For depth 2+, continue traversing but STOP at circular references
- Skip junction tables (tables with only foreign keys) for now
- Generate both `list` and `getByPk` variants

### 2. Circular Reference Detection
```
Path: books → author → books ❌ STOP (books already in path)
Path: books → tags → books ❌ STOP (books already in path)  
Path: books → tags → book_tags ✅ OK (new table)
```

### 3. Method Naming Convention
- Single include: `listWithAuthor()`
- Nested include: `listWithAuthorAndBooks()` 
- Multiple at same level: `listWithAuthorAndTags()`
- Pattern: `list` + `With` + PascalCase path components joined by `And`

### 4. Type Generation
Each method returns a concrete type:
```typescript
listWithAuthor(): Promise<(SelectBooks & { author: SelectAuthors })[]>
listWithAuthorAndBooks(): Promise<(SelectBooks & { 
  author: SelectAuthors & { books: SelectBooks[] } 
})[]>
```

## Implementation Steps

### Phase 1: Client Generation
1. Modify `emit-client.ts` to generate include methods
2. Create helper to traverse graph and detect circles
3. Generate method signatures with proper types
4. Skip junction tables (tables matching pattern `*_*` with only FKs)

### Phase 2: Type Generation  
1. Generate concrete return types for each method
2. Handle nested types properly
3. Ensure types match the actual data structure

### Phase 3: Server Routes
1. Update server route generation to handle new endpoints
2. Each method maps to include spec internally
3. Example: `/v1/books/list-with-author` → `{ include: { author: true } }`

### Phase 4: Testing
1. Test circular reference detection
2. Test type correctness
3. Test actual API calls

## Configuration

Add to config:
```typescript
{
  includeMethodsDepth: 2,  // How deep to traverse (default: 2)
  skipJunctionTables: true // Skip tables with only FKs (default: true)
}
```

## Files to Modify

1. `/workspace/src/emit-client.ts` - Generate new methods
2. `/workspace/src/emit-routes.ts` or `/workspace/src/emit-router-hono.ts` - Handle new routes
3. `/workspace/src/types.ts` - Add config options
4. Create new: `/workspace/src/emit-include-methods.ts` - Core logic for method generation

## Example Output

For `books` table with relationships to `authors` and `tags`:

```typescript
class BooksClient extends BaseClient {
  // Standard CRUD
  async list(params?: BaseParams): Promise<SelectBooks[]>
  async getByPk(id: string): Promise<SelectBooks | null>
  
  // Depth 1 includes
  async listWithAuthor(params?: Omit<BaseParams, 'include'>): Promise<(SelectBooks & { author: SelectAuthors })[]>
  async listWithTags(params?: Omit<BaseParams, 'include'>): Promise<(SelectBooks & { tags: SelectTags[] })[]>
  
  async getByPkWithAuthor(id: string): Promise<(SelectBooks & { author: SelectAuthors }) | null>
  async getByPkWithTags(id: string): Promise<(SelectBooks & { tags: SelectTags[] }) | null>
  
  // Combinations (if not too many)
  async listWithAuthorAndTags(params?: Omit<BaseParams, 'include'>): Promise<(SelectBooks & { 
    author: SelectAuthors;
    tags: SelectTags[] 
  })[]>
}
```

## Success Criteria

1. ✅ Methods are generated automatically based on relationships
2. ✅ Circular references are detected and stopped
3. ✅ Each method has fully typed return value
4. ✅ Junction tables are skipped (configurable)
5. ✅ Depth is configurable
6. ✅ Works with existing SDK structure