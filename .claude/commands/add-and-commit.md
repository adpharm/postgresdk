Add and commit all of our changes and if we have other changes elsewhere, include those. You can look at the diff to figure out what the changes are if you don't know.

Make sure to:

- [ ] read & follow the claude.md guidelines
- [ ] read & update the changelog, if needed
- [ ] read & update the readme, if needed

## Changelog Guidelines

When updating CHANGELOG.md, focus on **outcomes and capabilities**, not implementation details.

### Format

Entries must follow this exact structure:

```markdown
## YYYY-MM-DD

- type: Main change description
  - Sub-point explaining detail
  - Sub-point explaining detail
  - Sub-point explaining detail
- type: Another main change description
  - Sub-point explaining detail
```

**Type prefixes:**

- `feat:` - New features or capabilities
- `refactor:` - Code restructuring that changes behavior
- `fix:` - Bug fixes with user-visible impact
- `docs:` - Documentation updates
- `chore:` - Build, tooling, or maintenance changes

**Formatting rules:**

- Use date-based sections (## YYYY-MM-DD) for today's changes
- First line: type prefix + concise main change (one sentence)
- Sub-points: 2-space indent, start with hyphen, explain specifics
- Sub-points explain "what changed" and "why it matters"
- No empty lines between related sub-points
- One empty line between unrelated changes

**Include:**

- New capabilities users can now do
- Removed features or breaking changes
- Changes to APIs, schemas, or data structures
- Architectural changes (e.g., "replaced X with Y for Z reason")
- Bug fixes with user-visible impact
- Changes to workflows or processes

**Exclude:**

- Which specific library was used (unless the choice itself is significant)
- Styling/layout tweaks unless it's a major redesign
- Code organization changes that don't affect behavior
- Minor UI polish (spacing, colors, fonts)
- Vague statements like "improved UX" or "better styling"

**Test: Would a developer returning after 1 month need to know this?**
If the answer is no, omit it.
