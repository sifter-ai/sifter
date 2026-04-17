---
name: sdd-remote
description: >
  Remote sync workflow for Story Driven Development. Use when the user asks
  to update local state from remote changes, process remote drafts, and push
  enriched items back. Also applies when running a remote worker job (enrich
  or sync).
license: MIT
compatibility: Requires sdd CLI (npm i -g @applica-software-guru/sdd)
allowed-tools: Bash(sdd:*) Read Glob Grep
metadata:
  author: applica-software-guru
  version: "1.1"
---

# SDD Remote - Pull, Enrich, Push

## Purpose

Use this skill to synchronize local SDD docs with remote updates, enrich draft content,
and publish the enriched result to remote in active states.

This skill also applies when a **remote worker job** is dispatched from SDD Flow, as the
worker runs these same workflows on behalf of the user.

## Detection

This workflow applies when:

- `.sdd/config.yaml` exists in the project root
- The user asks to update local state from remote, pull pending CRs/bugs/docs,
  enrich drafts, or push pending remote updates
- A remote worker job prompt instructs you to follow this workflow

## Workflows

### Enrich Workflow (CR)

Follow this sequence to enrich a draft Change Request:

1. Pull remote updates:

```bash
sdd pull --crs-only
```

3. Generate draft TODO list:

```bash
sdd drafts
```

4. Enrich the draft with technical details, acceptance criteria, edge cases, and
   any relevant information from the project documentation and comments.

5. Transition the enriched CR to pending:

```bash
sdd mark-drafts-enriched
```

This performs: `draft → pending`

6. Push the enriched content:

```bash
sdd push
```

### Enrich Workflow (Document)

Follow this sequence to enrich a document:

1. Pull remote updates:

```bash
sdd pull --docs-only
```

3. Locate the document file in `product/` or `system/` and update its content
   with the enriched version.

4. Push the enriched content:

```bash
sdd push
```

If the document was in `draft` status, it will transition to `new` on the server.

### Sync Workflow (Project-level)

Follow this sequence for a full project sync (all pending items):

1. Pull the latest specs:

```bash
sdd pull
```

3. Run the `sdd` skill — it handles the full loop: open bugs, pending CRs,
   documentation sync, code implementation, mark-synced, and commit.

4. Push:

```bash
sdd push
```

## Rules

1. Always check remote configuration before pull/push (`sdd remote status`)
3. Do not use `sdd push --all` unless the user explicitly asks for a full reseed
4. If pull reports conflicts, do not overwrite local files blindly; report conflicts and ask how to proceed
5. Do not edit files inside `.sdd/` manually
6. Keep status transitions explicit: enrich first, then `sdd mark-drafts-enriched`, then push
7. **Always commit before pushing** when the sync workflow makes code changes

## Related commands

- `sdd remote init`
- `sdd remote status`
- `sdd pull`
- `sdd drafts`
- `sdd mark-drafts-enriched`
- `sdd sync`
- `sdd mark-synced`
- `sdd push`
