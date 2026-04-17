/**
 * MCP server for Sifter (read + write + structured query).
 *
 * Two modes:
 *   stdio           — for Claude Desktop / Cursor (npx @sifter-ai/mcp)
 *   streamable-http — for cloud hosted Sifter, mounted at /mcp
 *
 * Auth:
 *   stdio mode  — SIFTER_API_KEY env var
 *   HTTP mode   — Bearer token extracted per-request via AsyncLocalStorage
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SifterClient } from "@sifter-ai/sdk";
import { z } from "zod";

const API_URL = process.env["SIFTER_BASE_URL"] ?? "http://localhost:8000";
const ENV_API_KEY = process.env["SIFTER_API_KEY"] ?? "";

export const requestApiKey = new AsyncLocalStorage<string>();

function getClient(): SifterClient {
  const apiKey = requestApiKey.getStore() ?? ENV_API_KEY;
  if (!apiKey) throw new Error("SIFTER_API_KEY environment variable is required");
  return new SifterClient({ apiUrl: API_URL, apiKey });
}

function text(value: unknown): { content: [{ type: "text"; text: string }] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "sifter", version: "0.1.0" });

  // ── Read tools ─────────────────────────────────────────────────────────────

  server.registerTool("list_sifts", {
    description: "List all sifts with their name, instructions, and document counts.",
  }, async () => text(await getClient().listSifts()));

  server.registerTool("get_sift", {
    description: "Get sift metadata and inferred extraction schema.",
    inputSchema: { sift_id: z.string().describe("The sift identifier") },
  }, async ({ sift_id }) => {
    const s = await getClient().getSift(sift_id);
    return text({ id: s.id, name: s.name, status: s.status, defaultFolderId: s.defaultFolderId });
  });

  server.registerTool("list_records", {
    description: "Get extracted records from a sift.",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max records to return (max 100)"),
      offset: z.number().int().min(0).default(0).describe("Records to skip for pagination"),
    },
  }, async ({ sift_id, limit, offset }) => {
    const s = await getClient().getSift(sift_id);
    return text(await s.records({ limit: Math.min(limit, 100), offset }));
  });

  server.registerTool("query_sift", {
    description: "Run a natural language query over a sift's extracted records.",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      natural_language: z.string().describe("The question to answer, e.g. 'total by client'"),
    },
  }, async ({ sift_id, natural_language }) => {
    const s = await getClient().getSift(sift_id);
    const { results } = await s.query(natural_language);
    return text(results ?? []);
  });

  server.registerTool("list_folders", {
    description: "List all folders with their name and document count.",
  }, async () => text(await getClient().listFolders()));

  server.registerTool("get_folder", {
    description: "Get folder metadata, linked sifts, and document list.",
    inputSchema: { folder_id: z.string().describe("The folder identifier") },
  }, async ({ folder_id }) => {
    const f = await getClient().getFolder(folder_id);
    const [documents, sifts] = await Promise.all([f.documents(), f.sifts()]);
    return text({ id: f.id, name: f.name, documents, sifts });
  });

  server.registerTool("get_record_citations", {
    description: "Get per-field citation map for a record (page, bbox, source text for each field).",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      record_id: z.string().describe("The record identifier"),
    },
  }, async ({ sift_id, record_id }) => {
    const s = await getClient().getSift(sift_id);
    const records = await s.recordsByIds([record_id]);
    return text(records[0]?.citations ?? {});
  });

  // ── Write tools ─────────────────────────────────────────────────────────────

  server.registerTool("create_sift", {
    description: "Create a new sift with the given extraction instructions.",
    inputSchema: {
      name: z.string().describe("Human-readable sift name"),
      instructions: z.string().describe("Natural language extraction instructions"),
    },
  }, async ({ name, instructions }) => {
    const s = await getClient().createSift(name, instructions);
    return text({ id: s.id, name: s.name, status: s.status });
  });

  server.registerTool("update_sift", {
    description: "Update an existing sift's name or instructions.",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      name: z.string().optional().describe("New name (omit to keep current)"),
      instructions: z.string().optional().describe("New instructions (omit to keep current)"),
    },
  }, async ({ sift_id, name, instructions }) => {
    const s = await getClient().getSift(sift_id);
    const fields: { name?: string; instructions?: string } = {};
    if (name) fields.name = name;
    if (instructions) fields.instructions = instructions;
    await s.update(fields);
    return text({ id: s.id, name: s.name, status: s.status });
  });

  server.registerTool("delete_sift", {
    description: "Delete a sift and all its records.",
    inputSchema: { sift_id: z.string().describe("The sift identifier") },
  }, async ({ sift_id }) => {
    const s = await getClient().getSift(sift_id);
    await s.delete();
    return text({ deleted: true });
  });

  server.registerTool("upload_document", {
    description: "Upload a document to a folder. It will be processed by all linked sifts.",
    inputSchema: {
      folder_id: z.string().describe("Target folder identifier"),
      filename: z.string().describe("Original filename"),
      content_base64: z.string().describe("Base64-encoded file bytes"),
    },
  }, async ({ folder_id, filename, content_base64 }) => {
    const apiKey = requestApiKey.getStore() ?? ENV_API_KEY;
    const raw = Buffer.from(content_base64, "base64");
    const form = new FormData();
    form.append("file", new Blob([raw]), filename);
    const res = await fetch(`${API_URL}/api/folders/${folder_id}/documents`, {
      method: "POST",
      headers: apiKey ? { "X-API-Key": apiKey } : {},
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
    return text(await res.json());
  });

  server.registerTool("run_extraction", {
    description: "Enqueue extraction for a document on a specific sift.",
    inputSchema: {
      document_id: z.string().describe("The document identifier"),
      sift_id: z.string().describe("The sift to extract with"),
    },
  }, async ({ document_id, sift_id }) => {
    const s = await getClient().getSift(sift_id);
    return text(await s.extract(document_id));
  });

  server.registerTool("get_extraction_status", {
    description: "Check extraction status for a document on a sift.",
    inputSchema: {
      document_id: z.string().describe("The document identifier"),
      sift_id: z.string().describe("The sift identifier"),
    },
  }, async ({ document_id, sift_id }) => {
    const s = await getClient().getSift(sift_id);
    return text({ status: await s.extractionStatus(document_id) });
  });

  // ── Structured query tools ──────────────────────────────────────────────────

  server.registerTool("find_records", {
    description: "Filter records with structured criteria — no LLM roundtrip.",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      filter: z.record(z.unknown()).describe("Filter dict e.g. {\"total\": {\"$gt\": 1000}}"),
      sort: z.array(z.tuple([z.string(), z.union([z.literal(1), z.literal(-1)])])).optional()
        .describe("Sort spec e.g. [[\"date\", -1]]"),
      limit: z.number().int().min(1).max(200).default(50).describe("Max records (max 200)"),
      cursor: z.string().optional().describe("Pagination cursor from a previous call"),
    },
  }, async ({ sift_id, filter, sort, limit, cursor }) => {
    const s = await getClient().getSift(sift_id);
    const page = await s.find({
      filter,
      sort: sort as [string, 1 | -1][] | undefined,
      limit: Math.min(limit, 200),
      cursor,
    });
    return text({ records: page.records, next_cursor: page.next_cursor });
  });

  server.registerTool("aggregate_sift", {
    description: "Run a MongoDB aggregation pipeline against a sift's records.",
    inputSchema: {
      sift_id: z.string().describe("The sift identifier"),
      pipeline: z.array(z.record(z.unknown()))
        .describe("Pipeline stages e.g. [{\"$group\": {\"_id\": \"$client\", \"total\": {\"$sum\": \"$total\"}}}]"),
    },
  }, async ({ sift_id, pipeline }) => {
    const s = await getClient().getSift(sift_id);
    return text(await s.aggregate(pipeline));
  });

  // ── Resource ────────────────────────────────────────────────────────────────

  server.resource(
    "sift-records",
    new ResourceTemplate("sift://{sift_id}/records", { list: undefined }),
    async (uri, { sift_id }) => {
      const s = await getClient().getSift(String(sift_id));
      return {
        contents: [{
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(await s.records(), null, 2),
        }],
      };
    },
  );

  return server;
}
