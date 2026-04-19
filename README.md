# Sifter

**Structure any document. Query it like a database. Build on top via API.**

Open-source document intelligence engine — schema-driven extraction, NL query, MCP server, Python SDK. Self-hostable under MIT.

![Sifter demo](docs/images/hero.png)

---

## Why not RAG?

RAG is built for retrieval — *find me chunks similar to this query*. It breaks on homogeneous collections like invoices, contracts, or receipts where every document looks alike and the question is an aggregation, not a search.

![RAG vs Sifter](docs/images/why-nor-rag.png)

Sifter's approach: extract structured fields once (*client, date, total*), store them as typed records, query with real filters and aggregations. The answer is exact and reproducible — because it's a database query, not a similarity search.

---

## Quickstart

```bash
git clone https://github.com/sifterai/sifter
cd sifter/code
cp .env.example .env    # add SIFTER_LLM_API_KEY
docker compose up -d
```

Open `http://localhost:3000` — create a sift, upload documents, query results.

---

## Python SDK

```bash
pip install sifter-ai
```

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")

sift = s.create_sift("Invoices", "client name, date, total amount")
folder = s.create_folder("Q1")
folder.add_sift(sift.id)
folder.upload("./invoices/")

sift.wait()
for record in sift.records():
    print(record)
# {"client": "Acme Corp", "date": "2024-01-15", "total_amount": 1500.0}
```

## TypeScript SDK

```bash
npm install @sifter-ai/sdk
```

```typescript
import { SifterClient } from "@sifter-ai/sdk";

const client = new SifterClient({ apiKey: "sk-..." });

const sift = await client.sifts.get("sift_id");
const records = await sift.records({ filter: { status: "unpaid" } });
console.log(records);
```

---

## MCP server (Claude Desktop / Cursor / AI agents)

```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp", "--base-url", "http://localhost:8000"],
      "env": { "SIFTER_API_KEY": "sk-dev" }
    }
  }
}
```

Then ask Claude: *"What's the total unpaid across all invoices from last quarter?"*

Want a remote MCP URL without running a local server? → [Sifter Cloud](https://cloud.sifter.ai)

---

## What's included

- **Schema-driven extraction** — describe what to extract in natural language; schema is inferred automatically and exported as Pydantic / TypeScript types
- **NL query** — ask questions in plain language; Sifter generates inspectable MongoDB aggregation pipelines
- **MCP server** — stdio transport, read + write tools, zero custom integration code
- **REST API + Python SDK** — full OpenAPI spec, typed async client
- **Webhooks** — HMAC-signed HTTP callbacks on every extraction event
- **Spec-driven dashboards** — short NL spec → auto-generated board (KPI, breakdown, table, time series)
- **CLI** — `sifter extract`, `sifter records`, `sifter sifts` for terminal workflows and CI
- **Self-hostable** — Docker Compose, bring your own MongoDB and LLM API key

---

## Don't want to run infrastructure?

[**Sifter Cloud**](https://cloud.sifter.ai) is the managed version — no Mongo, no ops, remote MCP endpoint, Google Drive and email ingress. Free tier available.

---

## Docs

Full documentation at [sifterai.mintlify.app](https://sifterai.mintlify.app) — quickstart, SDK reference, MCP guide, cookbook, self-hosting.

---

## License

MIT — see [LICENSE](LICENSE).

Created by [Bruno Fortunato](https://github.com/bfortunato).
