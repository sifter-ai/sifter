# File Format and Status Lifecycle

## YAML Frontmatter

Every `.md` file in `product/` and `system/` must start with this YAML frontmatter:

```yaml
---
title: "File title"
status: new
author: ""
last-modified: "2025-01-01T00:00:00.000Z"
version: "1.0"
---
```

## Status values

- **`new`** — new file, needs to be implemented
- **`changed`** — modified since last sync, code needs updating
- **`deleted`** — feature to be removed, agent should delete related code
- **`synced`** — already implemented, up to date

## Version

Patch-bump on each edit: 1.0 → 1.1 → 1.2

## Last-modified

ISO 8601 datetime, updated on each edit.

## How sync works

`sdd sync` generates a structured prompt for the agent based on pending files:

- **`new` files**: the agent reads the full documentation and implements it from scratch
- **`changed` files**: SDD uses `git diff` to compute what changed in the documentation since the last commit, and includes the diff in the sync prompt — this way the agent sees exactly what was modified and can update only the affected code
- **`deleted` files**: the agent removes the related code

This is why **committing after every mark-synced is mandatory** — the git history is what SDD uses to detect changes.

## UX and screenshots

When a feature has UX mockups or screenshots, place them next to the feature doc:

- **Simple feature** (no screenshots): `product/features/auth.md`
- **Feature with screenshots**: use a folder with `index.md`:

```
product/features/auth/
  index.md          ← feature doc
  login.png         ← screenshot
  register.png      ← screenshot
```

Reference images in the markdown with relative paths:

```markdown
## UX

![Login screen](login.png)
![Register screen](register.png)
```

Both formats work — use a folder only when you have screenshots or multiple files for a feature.
