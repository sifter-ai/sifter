# Sifter Examples

Sample scripts for the Python and TypeScript SDKs. Each example uses the
same set of sample documents in `documents/`.

## Setup

### Python

```bash
cd python
pip install sifter-ai        # or: uv run --project ../../sdk-python
```

### TypeScript

```bash
cd ts
npm install
```

## Running

Set two environment variables before running any example:

```bash
export SIFTER_API_KEY=sk-...
export SIFTER_API_URL=http://127.0.0.1:8000   # local dev
# export SIFTER_API_URL=https://sifter.run    # cloud
```

> **macOS / Node note:** Node resolves `localhost` as `::1` (IPv6) on macOS,
> but the Sifter server listens on `127.0.0.1` (IPv4). Use `127.0.0.1`
> explicitly to avoid a connection refused error.

### Python

```bash
cd python
python 01_quickstart.py
python 02_invoices.py
# ...
```

### TypeScript

```bash
cd ts
npx tsx 01_quickstart.ts
# or via npm scripts:
npm run quickstart
npm run invoices
```

## Examples

| # | File | What it shows |
|---|------|---------------|
| 01 | `01_quickstart.py` / `.ts` | One-liner `s.sift()` — upload a folder, wait, get records |
| 02 | `02_invoices.py` / `.ts` | Structured invoice extraction with explicit schema |
| 03 | `03_contracts.py` / `.ts` | Contract extraction with boolean and date fields |
| 04 | `04_folder_pipeline.py` / `.ts` | Persistent folder — upload once, query many times |
| 05 | `05_query_and_chat.py` / `.ts` | Natural language query + aggregation |
| 06 | `06_webhooks.py` / `.ts` | Register a webhook and receive extraction events |

## Sample documents

```
documents/
  invoices/     10 sample PDF invoices (INV-2025-001 … INV-2025-010)
  contracts/    5 sample PDF contracts
```
