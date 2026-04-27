# sifter-ai

[![CI](https://github.com/sifter-ai/sifter/actions/workflows/ci.yml/badge.svg)](https://github.com/sifter-ai/sifter/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/sifter-ai/sifter/branch/main/graph/badge.svg)](https://codecov.io/gh/sifter-ai/sifter)
[![PyPI](https://img.shields.io/pypi/v/sifter-ai)](https://pypi.org/project/sifter-ai/)
[![Python](https://img.shields.io/badge/python-3.10%2B-blue)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](https://github.com/sifter-ai/sifter/blob/main/LICENSE)

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
