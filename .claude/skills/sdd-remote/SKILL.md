---
name: sdd-remote
description: >
  Remote sync workflow for Story Driven Development. Use this skill whenever
  the user asks to pull from remote, push changes to SDD Flow, enrich drafts,
  update local state from remote, publish local updates, process remote drafts,
  or run a remote worker job (enrich or sync). Also trigger on phrases like
  "sdd pull", "sdd push", "sync with SDD Flow", "enrich this CR",
  "push the remote updates", "pull the latest specs".
license: MIT
compatibility: Requires sdd CLI (npm i -g @applica-software-guru/sdd)
allowed-tools: Bash(sdd:*) Read Glob Grep
metadata:
  author: applica-software-guru
  version: "1.2"
---

# SDD Remote — Pull, Enrich, Push

## Purpose

Synchronize local SDD docs with remote updates (from the SDD Flow server), enrich draft content,
and publish the enriched result to remote in active states.

This skill also applies when a **remote worker job** is dispatched from SDD Flow — the worker
runs these same workflows on behalf of the user.

## Detection

This workflow applies when:

- `.sdd/config.yaml` exists in the project root with a `remote:` section configured
- The user asks to update local state from remote, pull pending CRs/bugs/docs,
  enrich drafts, or push pending remote updates
- A remote worker job prompt instructs you to follow this workflow

Before any pull/push operation, check remote configuration with `sdd remote status`.

## Workflows

### Enrich workflow — Change Request

Follow this sequence to enrich a draft CR:

1. Pull remote drafts:

```bash
sdd pull --crs-only
```

2. Generate the draft TODO list:

```bash
sdd drafts
```

3. Enrich the draft with technical details, acceptance criteria, edge cases, and any
   relevant information from the project documentation and comments.

4. Transition the enriched CR from `draft` to `pending`:

```bash
sdd mark-drafts-enriched
```

5. Push the enriched content:

```bash
sdd push
```

### Enrich workflow — Document

Follow this sequence to enrich a document (e.g. a feature spec):

1. Pull remote drafts:

```bash
sdd pull --docs-only
```

2. Locate the document file in `product/` or `system/` and update its content with the
   enriched version.

3. Push the enriched content:

```bash
sdd push
```

If the document was in `draft` status, it transitions to `new` on the server.

### Sync workflow — Project-level

Full project sync when the user asks for "the latest" or "pull everything and implement":

1. Pull the latest specs:

```bash
sdd pull
```

2. Run the `sdd` skill — it handles the full loop: open bugs, pending CRs, documentation
   sync, code implementation, mark-synced, and commit.

3. Push the local updates:

```bash
sdd push
```

## Rules

1. Always check remote configuration before pull/push (`sdd remote status`). Fail gracefully if not configured.
2. Do not use `sdd push --all` unless the user explicitly asks for a full reseed.
3. If pull reports conflicts, do not overwrite local files blindly. Report the conflicts and ask how to proceed.
4. Do not edit files inside `.sdd/` manually.
5. Keep status transitions explicit: enrich first, then `sdd mark-drafts-enriched`, then push.
6. **Always commit before pushing** when the sync workflow makes code changes. Push should never carry uncommitted work.

## Related commands

- `sdd remote init` — Configure remote for this project
- `sdd remote status` — Show remote config + connectivity
- `sdd pull` / `sdd pull --crs-only` / `sdd pull --docs-only`
- `sdd drafts` — List draft items to enrich
- `sdd mark-drafts-enriched` — Transition enriched drafts to pending
- `sdd sync` / `sdd mark-synced` — Local sync loop (see `sdd` skill)
- `sdd push` — Publish local updates to remote
