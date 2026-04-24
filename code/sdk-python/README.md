# sifter-ai

Python SDK for [Sifter](https://github.com/sifter-ai/sifter) — AI-powered document extraction.

```bash
pip install sifter-ai
```

```python
from sifter import Sifter

s = Sifter(api_key="sk-...")
records = s.sift("./invoices/", "client, date, total amount")
# [{"client": "Acme Corp", "date": "2024-01-15", "total_amount": 1500.0}, ...]
```

See the [main repository](https://github.com/sifter-ai/sifter) for full documentation.

MIT. [sifter-ai](https://github.com/sifter-ai).
