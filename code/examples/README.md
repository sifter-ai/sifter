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
# Default endpoint is https://sifter.run (Sifter Cloud).
# To use a self-hosted server:
# export SIFTER_API_URL=http://127.0.0.1:8000
```

> **macOS / Node note:** when pointing at a local server, Node resolves `localhost`
> as `::1` (IPv6) on macOS but the server listens on `127.0.0.1` (IPv4).
> Use `127.0.0.1` explicitly to avoid a connection refused error.

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
| 05 | `05_query_and_chat.py` / `.ts` | Natural language query → exact MongoDB aggregation results |
| 06 | `06_webhooks.py` / `.ts` | Register a webhook and receive extraction events |
| 07 | `07_citations.py` / `.ts` | Read per-field citation evidence (source text, page, confidence) |

## Sample documents

```
documents/
  invoices/     10 sample PDF invoices (invoice_001.pdf … invoice_010.pdf)
  contracts/    5 sample PDF contracts
```
