# sifter-server

Self-hostable FastAPI backend for [Sifter](https://github.com/bfortunato/sifter) — AI-powered document extraction engine.

```bash
pip install sifter-server
```

Or run the full stack with Docker Compose:

```bash
git clone https://github.com/bfortunato/sifter
cd sifter/code
cp .env.example .env   # set SIFTER_DEFAULT_API_KEY
docker compose up -d
```

See the [main repository](https://github.com/bfortunato/sifter) for full documentation, configuration reference, and deployment guide.

MIT. By [Bruno Fortunato](https://github.com/bfortunato).
