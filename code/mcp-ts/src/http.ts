/**
 * HTTP transport wrapper for the Sifter MCP server.
 *
 * Extracts the Bearer token from each request and stores it in
 * AsyncLocalStorage so tool handlers can use the per-request API key.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requestApiKey } from "./server.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function extractBearer(req: IncomingMessage): string {
  const auth = req.headers.authorization ?? "";
  return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      if (chunks.length === 0) { resolve(undefined); return; }
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

export async function startHttpServer(
  mcpServer: McpServer,
  host: string,
  port: number,
): Promise<void> {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await mcpServer.connect(transport);

  const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
    const token = extractBearer(req);
    requestApiKey.run(token, async () => {
      try {
        const body = await readBody(req);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(500).end(String(err));
        }
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.on("error", reject);
    httpServer.listen(port, host, resolve);
  });

  console.error(`Sifter MCP server listening on http://${host}:${port}`);
}
