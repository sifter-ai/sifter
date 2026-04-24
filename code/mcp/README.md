# sifter-mcp

MCP server for [Sifter](https://github.com/sifter-ai/sifter) — gives Claude Desktop, Cursor, and AI agents read access to your extracted records.

## Usage

### Cloud (HTTP, zero install)

Configure Claude Desktop to connect to your Sifter Cloud instance:

```json
{
  "mcpServers": {
    "sifter": {
      "url": "https://api.sifter.ai/mcp",
      "headers": { "Authorization": "Bearer <your-api-key>" }
    }
  }
}
```

### Self-hosted (stdio via uvx)

```json
{
  "mcpServers": {
    "sifter": {
      "command": "uvx",
      "args": ["sifter-mcp", "--base-url", "http://localhost:8000"],
      "env": { "SIFTER_API_KEY": "<your-api-key>" }
    }
  }
}
```

## Tools

- `list_sifts` — list all extractors
- `get_sift` — get extractor details and inferred schema
- `list_records` — paginate extracted records
- `query_sift` — run a natural language query over records
- `list_folders` — list document folders
- `get_folder` — get folder contents

## License

MIT. [sifter-ai](https://github.com/sifter-ai).
