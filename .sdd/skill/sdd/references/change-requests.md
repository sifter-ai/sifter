# Change Requests

Change Requests (CRs) are markdown files in `change-requests/` that describe modifications to the documentation.

## CR format

```yaml
---
title: "Add authentication feature"
status: draft
author: "user"
created-at: "2025-01-01T00:00:00.000Z"
---
```

- **status**: `draft` (pending) or `applied` (already processed)
- **status**: `draft` (needs enrichment), `pending` (ready to process), or `applied` (already processed)

## CR workflow

1. Check for pending CRs: `sdd cr pending`
2. Read each pending CR and apply the described changes to the documentation files (marking them as `new`, `changed`, or `deleted`)
3. After applying a CR to the docs, mark it: `sdd mark-cr-applied change-requests/CR-001.md`
4. Then run `sdd sync` to implement the code changes

## CR commands

- `sdd cr list` — See all change requests and their status
- `sdd cr pending` — Show only pending CRs to process
- `sdd mark-cr-applied [files...]` — Mark CRs as applied after updating the docs
