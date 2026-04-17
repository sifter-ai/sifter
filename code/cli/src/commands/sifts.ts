import { Command } from "commander";
import { autoFormat, ok, err } from "../output.js";
import { makeClient, type GlobalOpts } from "../client.js";

export function siftsCommand(globals: () => GlobalOpts): Command {
  const cmd = new Command("sifts").description("Manage sifts");

  cmd
    .command("list")
    .description("List all sifts")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const sifts = await makeClient(globals()).listSifts(parseInt(opts.limit));
        autoFormat(sifts.map(s => ({ id: s.id, name: s.name, status: s.status })), !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("get <sift-id>")
    .description("Get a sift by ID")
    .option("--json", "Output as JSON")
    .action(async (siftId, opts) => {
      try {
        const s = await makeClient(globals()).getSift(siftId);
        autoFormat({ id: s.id, name: s.name, status: s.status }, !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("create")
    .description("Create a new sift")
    .requiredOption("-n, --name <name>", "Sift name")
    .requiredOption("-i, --instructions <text>", "Extraction instructions")
    .option("--description <text>", "Description", "")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const s = await makeClient(globals()).createSift(opts.name, opts.instructions, opts.description);
        autoFormat({ id: s.id, name: s.name, status: s.status }, !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("update <sift-id>")
    .description("Update a sift")
    .option("-n, --name <name>", "New name")
    .option("-i, --instructions <text>", "New instructions")
    .action(async (siftId, opts) => {
      try {
        const fields: { name?: string; instructions?: string } = {};
        if (opts.name) fields.name = opts.name;
        if (opts.instructions) fields.instructions = opts.instructions;
        await (await makeClient(globals()).getSift(siftId)).update(fields);
        ok(`Updated sift ${siftId}.`);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("delete <sift-id>")
    .description("Delete a sift")
    .option("-y, --yes", "Skip confirmation")
    .action(async (siftId, opts) => {
      if (!opts.yes) {
        const { createInterface } = await import("node:readline");
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise<string>(r => rl.question(`Delete sift ${siftId}? [y/N] `, r));
        rl.close();
        if (answer.toLowerCase() !== "y") { process.exit(0); }
      }
      try {
        await (await makeClient(globals()).getSift(siftId)).delete();
        ok(`Deleted sift ${siftId}.`);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("schema <sift-id>")
    .description("Emit typed schema for a sift")
    .option("-f, --format <fmt>", "Output format: json | ts | pydantic", "json")
    .option("--watch", "Poll for schema changes")
    .action(async (siftId, opts) => {
      const g = globals();
      const headers: Record<string, string> = g.apiKey ? { "X-API-Key": g.apiKey } : {};

      const fetchSchema = async (): Promise<{ version: number; text: string }> => {
        const endpoints: Record<string, string> = {
          ts: `${g.apiUrl}/api/sifts/${siftId}/schema.ts`,
          pydantic: `${g.apiUrl}/api/sifts/${siftId}/schema.pydantic`,
          json: `${g.apiUrl}/api/sifts/${siftId}/schema`,
        };
        const url = endpoints[opts.format] ?? endpoints["json"]!;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(await res.text());
        if (opts.format === "json") {
          const data = await res.json() as { schema_version?: number };
          return { version: data.schema_version ?? 0, text: JSON.stringify(data, null, 2) };
        }
        return { version: 0, text: await res.text() };
      };

      try {
        let { version, text } = await fetchSchema();
        process.stdout.write(text + "\n");
        if (opts.watch) {
          process.stderr.write("Watching for schema changes (Ctrl-C to stop)…\n");
          while (true) {
            await new Promise(r => setTimeout(r, 5000));
            const next = await fetchSchema();
            if (next.version !== version || next.text !== text) {
              ({ version, text } = next);
              process.stdout.write(text + "\n");
            }
          }
        }
      } catch (e) { err(String(e)); process.exit(2); }
    });

  return cmd;
}
