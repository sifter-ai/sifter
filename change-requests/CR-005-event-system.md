---
title: "Event system: SDK callbacks and server-side webhooks"
status: applied
author: "Bruno Fortunato"
created-at: "2026-04-13T00:00:00.000Z"
---

## Summary

Add an event system to Sifter with two layers:

1. **SDK callbacks** — local event handlers for scripts and automation. The SDK polls internally during `wait()`. Zero infrastructure needed.
2. **Server-side webhooks** — register URLs to receive HTTP POST on events. For production integrations.

Depends on CR-004 (sift and folder entities in SDK).

### SDK callbacks

`on()` accepts a single event name, a list of event names, or a wildcard pattern. Wildcards use `*` to match any segment.

```python
# Single event
sift.on("document.processed", lambda doc, record: print(record))

# Multiple events
sift.on(["document.processed", "error"], lambda doc, record: print(record))

# Wildcard — all events on this sift
sift.on("*", lambda doc, record: print(record))

# Wildcard — all document-level events
sift.on("document.*", lambda doc, record: print(record))

folder.on("document.uploaded", lambda doc: print(f"New: {doc.filename}"))
folder.on("*", lambda doc: print(f"Event on: {doc.filename}"))
```

### Server-side webhooks

`events` accepts a single event name, a list of event names, or a wildcard pattern.

```python
# Single event
s.register_hook(
    events="sift.document.processed",
    url="https://my-app.com/webhook",
    sift_id=sift.id,  # optional filter
)

# Multiple events
s.register_hook(
    events=["sift.document.processed", "sift.error"],
    url="https://my-app.com/webhook",
)

# Wildcard — all sift-level events
s.register_hook(
    events="sift.*",
    url="https://my-app.com/webhook",
)

# Wildcard — all events
s.register_hook(
    events="*",
    url="https://my-app.com/webhook",
)

hooks = s.list_hooks()
s.delete_hook(hook_id)
```

### Event types

- `sift.document.processed` — a document was extracted by a sift
- `sift.completed` — all documents in a sift finished processing
- `sift.error` — extraction error on a document
- `folder.document.uploaded` — new document added to a folder

### Wildcard matching rules

- `*` — matches any single segment (e.g. `sift.*` matches `sift.completed` but not `folder.document.uploaded`)
- `**` — matches any number of segments (e.g. `**` matches everything)
- Matching is evaluated server-side for webhooks and client-side for SDK callbacks

## Changes to product/

TBD — to be detailed when this CR is enriched.

## Changes to system/

TBD

## Changes to code/

TBD
