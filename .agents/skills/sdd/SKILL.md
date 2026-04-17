---
name: sdd
description: >
  Story Driven Development workflow. Use when working in a project
  with .sdd/config.yaml, or when the user mentions SDD, sdd sync,
  story driven development, or spec-driven development.
license: MIT
compatibility: Requires sdd CLI (npm i -g @applica-software-guru/sdd)
allowed-tools: Bash(sdd:*) Read Glob Grep
metadata:
  author: applica-software-guru
  version: "1.0"
---

# SDD — Story Driven Development

## Detection

This project uses SDD if `.sdd/config.yaml` exists in the project root.

## Workflow

Follow this loop every time you work on an SDD project:

1. Run `sdd bug open` — check if there are open bugs to fix first
2. If there are open bugs, fix the code/docs, then run `sdd mark-bug-resolved`
3. Run `sdd cr pending` — check if there are change requests to process
4. If there are pending CRs, apply them to the docs, then run `sdd mark-cr-applied`
5. Run `sdd sync` to see what needs to be implemented
6. Read the documentation files listed in the sync output
7. Implement what each file describes, writing code inside `code/`
8. After implementing, mark files as synced:

```
sdd mark-synced product/features/auth.md
```

Or mark all pending files at once:

```
sdd mark-synced
```

9. **Commit immediately after mark-synced** — this is mandatory:

```
git add -A && git commit -m "sdd sync: <brief description of what was implemented>"
```

Do NOT skip this step. Every mark-synced must be followed by a git commit.

10. If remote sync is configured (remote section in `.sdd/config.yaml` and API key available), remind the user they can publish updates with:

```
sdd push
```

### Removing a feature

If a documentation file has `status: deleted`, it means that feature should be removed.
Delete the related code in `code/`, then run `sdd mark-synced <file>` (the doc file will be removed automatically), then commit.

## Available commands

- `sdd status` — See all documentation files and their state (new/changed/deleted/synced)
- `sdd diff` — See what changed since last sync
- `sdd sync` — Get the sync prompt for pending files (includes git diff for changed files)
- `sdd validate` — Check for broken references and issues
- `sdd mark-synced [files...]` — Mark specific files (or all) as synced
- `sdd cr list` — List all change requests with their status
- `sdd cr pending` — Show pending change requests to process
- `sdd mark-cr-applied [files...]` — Mark change requests as applied
- `sdd bug list` — List all bugs with their status
- `sdd bug open` — Show open bugs to fix
- `sdd mark-bug-resolved [files...]` — Mark bugs as resolved

## Rules

1. **Always commit after mark-synced** — run `git add -A && git commit -m "sdd sync: ..."` immediately after `sdd mark-synced`. Never leave synced files uncommitted.
2. Before running `sdd sync`, check for open bugs with `sdd bug open` and pending change requests with `sdd cr pending`
3. If there are pending CRs, apply them to the docs first, then mark them with `sdd mark-cr-applied`
4. Only implement what the sync prompt asks for
5. All generated code goes inside `code/`
6. Respect all constraints in `## Agent Notes` sections (if present)
7. Do not edit files inside `.sdd/` manually
8. If remote is configured, suggest `sdd push` after successful local sync + commit

## Project structure

- `product/` — What to build (vision, users, features)
- `system/` — How to build it (entities, architecture, tech stack, interfaces)
- `code/` — All generated source code goes here
- `change-requests/` — Change requests to the documentation
- `bugs/` — Bug reports
- `.sdd/` — Project config and sync state (do not edit)

## References

For detailed information on specific topics, see:

- [File format and status lifecycle](references/file-format.md)
- [Change Requests workflow](references/change-requests.md)
- [Bug workflow](references/bugs.md)
- [Remote pull/enrich/push workflow](../sdd-remote/SKILL.md)
- [UI Component workflow](../sdd-ui/SKILL.md)
