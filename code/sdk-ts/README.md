# @sifter-ai/sdk

[![CI](https://github.com/sifter-ai/sifter/actions/workflows/ci.yml/badge.svg)](https://github.com/sifter-ai/sifter/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sifter-ai/sifter/branch/main/graph/badge.svg)](https://codecov.io/gh/sifter-ai/sifter)

TypeScript SDK for [Sifter](https://github.com/sifter-ai/sifter) — AI-powered document extraction.

```bash
npm install @sifter-ai/sdk
```

```typescript
import { SifterClient } from "@sifter-ai/sdk";

const client = new SifterClient({ apiKey: "sk-..." });
const sift = await client.createSift({ name: "Invoices", fields: "client, date, total amount" });
const records = await sift.records();
// [{ client: "Acme Corp", date: "2024-01-15", total_amount: 1500.0 }, ...]
```

See the [main repository](https://github.com/sifter-ai/sifter) for full documentation.

MIT. [sifter-ai](https://github.com/sifter-ai).
