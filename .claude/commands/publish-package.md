---
argument-hint: [VERSION_TYPE (major 1.x.x, minor x.1.x, patch x.x.1)]
description: Publish postgresdk to npm
---

Publish the package, following these steps.

1. Check if we have uncommitted changes.
   - if we do, run the @add-and-commit.md slash command in a separate agent.
2. Run ./publish with the flag given by the argument-hint ($1). If not given, ask the user.
3. Update the changelog with the newly-published version number, if there is an unreleased section.
