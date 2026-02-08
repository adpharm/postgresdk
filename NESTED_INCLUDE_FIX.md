# Fix: Nested Include Parameter Types

## The Bug

When using nested includes in typed methods (like `listWithCapturesAndVideoSections`), the nested `include` parameter was typed with the **parent table's** IncludeSpec instead of the **target table's** IncludeSpec.

### Example (websites.ts)

**Before (WRONG):**
```typescript
getByPkWithCapturesAndVideoSections(pk: string, params?: {
  capturesInclude?: {
    include?: WebsitesIncludeSpec;  // ❌ WRONG - parent table
  };
})
```

**After (CORRECT):**
```typescript
getByPkWithCapturesAndVideoSections(pk: string, params?: {
  capturesInclude?: {
    include?: CapturesIncludeSpec;  // ✅ CORRECT - target table
  };
})
```

## Why This Matters

When configuring includes **FOR** the captures table, you need `CapturesIncludeSpec` to specify what to include **FROM** captures (like `video_sections`, `website`, etc.).

Using the parent table's spec meant:
- ❌ No autocomplete for the target table's relations
- ❌ TypeScript errors when trying to include valid relations
- ❌ Could accidentally specify invalid relations

## The Fix

**File:** `/workspace/src/emit-client.ts`

### Change 1: Determine Target Table Type (Line 196)

```typescript
// Old code (implicit parent table type)
paramsType = `{
  ${paramName}?: {
    include?: ${Type}IncludeSpec;  // ❌ Always uses parent table
  };
}`;

// New code (explicit target table type)
const targetTable = method.targets[0];
const targetType = targetTable ? pascal(targetTable) : Type;
paramsType = `{
  ${paramName}?: {
    include?: ${targetType}IncludeSpec;  // ✅ Uses target table
  };
}`;
```

### Change 2: Import Target Table IncludeSpecs (Line 118)

```typescript
// Old code (only imports base table's IncludeSpec)
const includeSpecImport = `import type { ${Type}IncludeSpec } from "./include-spec${ext}";`;

// New code (imports all needed IncludeSpecs)
const includeSpecTypes = [table.name, ...Array.from(importedTypes).filter(t => t !== table.name)];
const includeSpecImport = `import type { ${includeSpecTypes.map(t => `${pascal(t)}IncludeSpec`).join(', ')} } from "./include-spec${ext}";`;
```

## Impact

### Before
```typescript
// In websites.ts
import type { WebsitesIncludeSpec } from "./include-spec";  // ❌ Only parent

getByPkWithCapturesAndVideoSections(pk: string, params?: {
  capturesInclude?: {
    include?: WebsitesIncludeSpec;  // ❌ Can't specify captures relations
  };
})
```

### After
```typescript
// In websites.ts
import type { WebsitesIncludeSpec, CapturesIncludeSpec, VideoSectionsIncludeSpec } from "./include-spec";  // ✅ All needed types

getByPkWithCapturesAndVideoSections(pk: string, params?: {
  capturesInclude?: {
    include?: CapturesIncludeSpec;  // ✅ Can specify captures relations
  };
})
```

## Benefits

1. **Correct Type Safety**
   - Nested includes now have proper autocomplete
   - TypeScript catches invalid relations at compile time
   - No more confusion about which table's relations to use

2. **Deep Nesting Support**
   ```typescript
   await sdk.websites.listWithCapturesAndVideoSections({
     capturesInclude: {
       include: {
         video_sections: {  // ✅ Autocomplete works!
           limit: 10,
           orderBy: "created_at"
         }
       }
     }
   });
   ```

3. **Consistent Behavior**
   - Now matches the pattern used in regular `list()` methods
   - Parent table for base params, target table for nested includes

## Testing

**New Test:** `/workspace/test/test-nested-include-types.test.ts`
- Verifies nested includes use target table's IncludeSpec
- Confirms deep nesting is properly typed
- Validates that parent and child specs are distinct

**Verification:**
```bash
bun test test/test-nested-include-types.test.ts
✅ 3 tests passing
```

**Full Test Suite:**
```bash
bun run test
✅ All tests passing (no regressions)
```

## Example Use Cases

### 1. Configure Nested Limits
```typescript
// Now you can control nested query parameters
await sdk.websites.getByPkWithCaptures("site-1", {
  capturesInclude: {
    limit: 10,
    orderBy: "created_at",
    include: {
      video_sections: {  // ✅ Properly typed
        limit: 5
      }
    }
  }
});
```

### 2. Deep Nesting
```typescript
// 3-level includes are now properly typed
await sdk.authors.listWithBooksAndTags({
  booksInclude: {
    include: {
      tags: {  // ✅ BooksIncludeSpec allows 'tags'
        limit: 3,
        orderBy: "name"
      }
    }
  }
});
```

### 3. Multiple Nested Includes
```typescript
await sdk.websites.listWithCapturesAndVideoSections({
  capturesInclude: {
    include: {
      technologies: true,  // ✅ CapturesIncludeSpec knows this exists
      video_sections: {
        limit: 5
      }
    }
  }
});
```

## Files Changed

- `/workspace/src/emit-client.ts`
  - Line ~196: Determine target table type for nested includes
  - Line ~118: Import all target table IncludeSpec types

## Related Changes

This fix builds on the initial type safety improvement where we changed:
- `include?: any` → `include?: ${Type}IncludeSpec`

That change added type safety to the base include parameter. This fix extends that to nested includes, ensuring the entire include tree is properly typed.
