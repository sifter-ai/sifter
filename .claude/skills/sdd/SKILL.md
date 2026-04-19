---
name: sdd
description: >
  Story Driven Development workflow. Use this skill whenever working in a
  project that has `.sdd/config.yaml`, or when the user mentions SDD, sdd sync,
  story driven development, spec-driven development, change requests, bugs, or
  asks to implement a feature described in `product/` or `system/`. Also trigger
  on phrases like "sync the docs", "mark synced", "apply this CR", "fix this bug"
  when an SDD project is detected.
license: MIT
compatibility: Requires sdd CLI (npm i -g @applica-software-guru/sdd)
allowed-tools: Bash(sdd:*) Read Glob Grep
metadata:
  author: applica-software-guru
  version: "1.1"
---

# SDD — Story Driven Development

## What this is

SDD keeps documentation (`product/`, `system/`) and code (`code/`) in sync.
Specs change → `sdd sync` surfaces what's pending → agent implements → `sdd mark-synced` commits the state → repeat.

The engine behind it is git: SDD uses `git diff` on the doc files to know what changed since the last sync. That's why committing immediately after every `mark-synced` is non-negotiable — skip a commit and the next sync will see phantom changes.

## Detection

This project uses SDD if `.sdd/config.yaml` exists in the project root.

## The core loop

Every session on an SDD project starts the same way — clear the backlog from highest priority down, then move new work forward:

1. **Bugs first.** Run `sdd bug open`. If there are open bugs, fix the code/docs and run `sdd mark-bug-resolved`. Bugs block everything else.

2. **Then Change Requests.** Run `sdd cr pending`. If there are pending CRs, apply them to the docs in `product/`/`system/` (this flips docs to `new`/`changed`/`deleted`), then run `sdd mark-cr-applied`. CRs are the intended way to modify specs — never edit docs arbitrarily to reflect user requests; turn them into CRs first if scope justifies it.

3. **Then sync.** Run `sdd sync`. It returns a structured prompt listing every pending file and (for `changed` files) the exact git diff of what changed in the spec. Read only what the prompt tells you to read.

4. **Implement.** Write code inside `code/` matching what each doc describes. For `deleted` files, remove the corresponding code — the doc itself gets deleted automatically on mark-synced.

5. **Mark synced + commit.** This is one atomic step:

```bash
sdd mark-synced                     # or sdd mark-synced <specific files>
git add -A && git commit -m "sdd sync: <what you implemented>"
```

Every mark-synced MUST be followed by a commit in the same turn. No exceptions. See "Why the commit is mandatory" below.

6. **Publish (if remote configured).** If `.sdd/config.yaml` has a `remote:` section and an API key is set, remind the user they can push with `sdd push`.

## Why the commit is mandatory

`sdd mark-synced` records a snapshot of the doc files as the new sync baseline. On the next `sdd sync`, SDD runs `git diff` between HEAD and the working tree for each doc — that's how it detects what changed. If you mark-sync without committing, the diff machinery breaks: either the next sync sees nothing (false "all synced") or it re-surfaces already-implemented changes. The commit is what makes the sync loop durable.

## Available commands

- `sdd status` — All doc files and their state (new/changed/deleted/synced)
- `sdd diff` — Spec changes since last sync
- `sdd sync` — Structured prompt for pending files (with git diff for `changed`)
- `sdd validate` — Check for broken references and issues
- `sdd mark-synced [files...]` — Mark files (or all) as synced
- `sdd cr list` / `sdd cr pending` / `sdd mark-cr-applied [files...]`
- `sdd bug list` / `sdd bug open` / `sdd mark-bug-resolved [files...]`

## Rules

1. **Always commit after mark-synced, in the same turn.** This is the one rule you cannot break — see rationale above.
2. Always check bugs + CRs before sync; they take priority over new work.
3. Only implement what the sync prompt asks for. Don't wander into unrelated code.
4. All generated code goes inside `code/`. Nothing in `code/` should exist that isn't described by a doc.
5. Respect constraints in `## Agent Notes` sections of doc files when present.
6. Never edit files inside `.sdd/` manually — it's SDD's internal state.
7. If remote is configured, suggest `sdd push` after a successful local sync + commit.

## Project structure

- `product/` — What to build (vision, users, features)
- `system/` — How to build it (entities, architecture, tech-stack, interfaces)
- `code/` — All generated source code
- `change-requests/` — Proposed modifications to the docs
- `bugs/` — Bug reports
- `.sdd/` — Config and sync state (do not edit by hand)

## References

- [File format and status lifecycle](references/file-format.md)
- [Change Requests workflow](references/change-requests.md)
- [Bug workflow](references/bugs.md)
- [Remote pull/enrich/push workflow](../sdd-remote/SKILL.md)
