#!/usr/bin/env node
/**
 * sifter-mcp — MCP server for Sifter
 *
 * Usage:
 *   SIFTER_API_KEY=sk-... npx @sifter-ai/mcp
 *   SIFTER_API_KEY=sk-... npx @sifter-ai/mcp --transport streamable-http --port 8001
 *
 * Claude Desktop config:
 *   {
 *     "mcpServers": {
 *       "sifter": {
 *         "command": "npx",
 *         "args": ["-y", "@sifter-ai/mcp"],
 *         "env": { "SIFTER_API_KEY": "sk-..." }
 *       }
 *     }
 *   }
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { startHttpServer } from "./http.js";

const args = process.argv.slice(2);

function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1]! : fallback;
}

const transport = flag("--transport", "stdio");
const host = flag("--host", "0.0.0.0");
const port = parseInt(flag("--port", "8001"), 10);

const server = createServer();

if (transport === "stdio") {
  const t = new StdioServerTransport();
  await server.connect(t);
} else if (transport === "streamable-http") {
  await startHttpServer(server, host, port);
} else {
  console.error(`Unknown transport: ${transport}. Use 'stdio' or 'streamable-http'.`);
  process.exit(1);
}
