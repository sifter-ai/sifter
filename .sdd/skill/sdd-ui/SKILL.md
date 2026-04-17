---
name: sdd-ui
description: >
  UI Component Editor workflow. Use when the user wants to implement a React component
  from a screenshot in an SDD project, iterating visually with live preview.
license: MIT
compatibility: >
  Requires sdd CLI (npm i -g @applica-software-guru/sdd).
  Requires Playwright MCP configured in Claude Code
  (e.g. @playwright/mcp or @executeautomation/playwright-mcp).
allowed-tools: Bash(sdd:*) Read Glob Grep Edit Write mcp__playwright__screenshot mcp__playwright__navigate mcp__playwright__click
metadata:
  author: applica-software-guru
  version: "1.1"
---

# SDD UI — Visual Component Editor

## Purpose

Use this workflow when implementing a React component from a screenshot reference in an SDD project.
The split-panel editor shows the spec screenshot on the left and the live component on the right,
so you can iterate visually until they match.

## Prerequisites

- `sdd` CLI installed globally
- Playwright MCP configured in Claude Code settings
  - e.g. `@playwright/mcp` or `@executeautomation/playwright-mcp`
  - If not configured, inform the user and stop — visual feedback won't work without it

## Workflow

### Step 1 — Read the spec

Read the SDD feature file to understand what the component should look like and do.
Look for any screenshot paths referenced in the feature doc.

### Step 2 — Launch the editor

```bash
# Single screenshot — detached (recommended when run by an agent)
sdd ui launch-editor LoginForm \
  --screenshot product/features/auth/login.png \
  --detach

# Multiple screenshots (e.g. desktop + mobile)
sdd ui launch-editor LoginForm \
  --screenshot product/features/auth/login-desktop.png \
  --screenshot product/features/auth/login-mobile.png \
  --detach
```

The command will:
- Scaffold `code/components/LoginForm.tsx` if it doesn't exist
- Print the exact component file path to edit
- Start the editor at `http://localhost:5174`

With `--detach` the process runs in background and the terminal is immediately free.
Without `--detach` it runs in foreground (use Ctrl+C to stop).

With multiple screenshots, the left panel shows a tab per screenshot.
With a single screenshot, no tab bar is shown.

### Step 3 — Implement the component

Edit the file printed by `sdd ui launch-editor` (e.g. `code/components/LoginForm.tsx`).

Write a React component that matches the screenshot. Use standard HTML/CSS or inline styles —
no external UI library unless the project already uses one.

Vite HMR will update the right panel automatically on every save.

### Step 4 — Visual check with Playwright

After each save, screenshot the live preview and compare it with the spec:

```
mcp__playwright__navigate http://localhost:5174
mcp__playwright__screenshot
```

The left panel already shows the spec screenshot for direct comparison.
Note differences in layout, spacing, typography, colors, and component structure.

### Step 5 — Iterate

Edit component → Playwright screenshot → compare → repeat until the preview matches the spec.

### Step 6 — Finalize

```bash
sdd ui stop
sdd mark-synced product/features/auth/login.md
git add -A && git commit -m "sdd sync: implement LoginForm component"
```

## Notes

- The component file is permanent — it lives in `code/components/` and is part of your project
- Port `5174` by default (not `5173`) to avoid conflicts with the user's app dev server
- If the component needs props, scaffold it with hardcoded sample data for the preview

## Troubleshooting

**Playwright MCP not configured:**
Stop and ask the user to add it to their Claude Code MCP settings before continuing.

**Component import fails in preview:**
Check that the component file has a valid default export and no TypeScript errors.

**Port already in use:**
`sdd ui launch-editor LoginForm --screenshot login.png --port 5175`
