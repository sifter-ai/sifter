# Bugs

Bugs are markdown files in `bugs/` that describe problems found in the codebase.

## Bug format

```yaml
---
title: "Login fails with empty password"
status: open
author: "user"
created-at: "2025-01-01T00:00:00.000Z"
---
```

- **status**: `draft` (needs enrichment), `open` (needs fixing), or `resolved` (already fixed)

## Bug workflow

1. Check for open bugs: `sdd bug open`
2. Read each open bug and fix the code and/or documentation
3. After fixing a bug, mark it: `sdd mark-bug-resolved bugs/BUG-001.md`
4. Commit the fix

## Bug commands

- `sdd bug list` — See all bugs and their status
- `sdd bug open` — Show only open bugs to fix
- `sdd mark-bug-resolved [files...]` — Mark bugs as resolved after fixing
