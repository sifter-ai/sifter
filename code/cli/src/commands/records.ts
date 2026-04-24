import { writeFile } from "node:fs/promises";
import { Command } from "commander";
import { autoFormat, ok, err } from "../output.js";
import { makeClient, type GlobalOpts } from "../client.js";

export function recordsCommand(globals: () => GlobalOpts): Command {
  const cmd = new Command("records").description("Query and export records");

  cmd
    .command("list <sift-id>")
    .description("List records from a sift")
    .option("--limit <n>", "Max results", "50")
    .option("--cursor <cursor>", "Pagination cursor")
    .option("--filter <json>", "Filter as JSON e.g. '{\"total\":{\"$gt\":100}}'")
    .option("--json", "Output as JSON")
    .action(async (siftId, opts) => {
      try {
        const sift = await makeClient(globals()).getSift(siftId);
        const limit = parseInt(opts.limit);
        let rows: unknown[];

        const filter = opts.filter ? JSON.parse(opts.filter) as Record<string, unknown> : undefined;
        const page = await sift.find({ filter, limit, cursor: opts.cursor });
        rows = page.records;

        const data = rows.map(r => {
          const rec = r as Record<string, unknown>;
          return (rec["extracted_data"] as Record<string, unknown>) ?? rec;
        });
        autoFormat(data, !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("query <sift-id> <question>")
    .description("Run a natural-language query against a sift")
    .option("--json", "Output as JSON")
    .action(async (siftId, question, opts) => {
      try {
        const sift = await makeClient(globals()).getSift(siftId);
        const { results } = await sift.query(question);
        autoFormat(results ?? [], !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("export <sift-id>")
    .description("Export records as CSV")
    .option("-o, --output <file>", "Output file", "records.csv")
    .action(async (siftId, opts) => {
      try {
        const sift = await makeClient(globals()).getSift(siftId);
        const csv = await sift.exportCsv();
        await writeFile(opts.output, csv, "utf-8");
        ok(`Exported to ${opts.output}`);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  return cmd;
}
