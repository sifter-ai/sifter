import { Command } from "commander";
import { autoFormat, err } from "../output.js";
import { makeClient, uploadDir, waitForSift, type GlobalOpts } from "../client.js";

export function extractCommand(globals: () => GlobalOpts): Command {
  return new Command("extract")
    .description("Upload and extract documents in one shot")
    .argument("<paths...>", "Files or directories to upload")
    .requiredOption("-i, --instructions <text>", "Extraction instructions")
    .option("--sift <id>", "Existing sift ID (creates a new one if omitted)")
    .option("--no-wait", "Return immediately without waiting for completion")
    .option("--json", "Output as JSON")
    .option("--quiet", "Suppress progress output")
    .action(async (paths: string[], opts) => {
      const g = globals();
      const client = makeClient(g);
      try {
        let siftId: string;
        if (opts.sift) {
          siftId = opts.sift as string;
        } else {
          const s = await client.createSift("extract-" + Date.now(), opts.instructions as string);
          siftId = s.id;
          if (!opts.quiet) process.stderr.write(`Created sift: ${siftId}\n`);
        }

        for (const p of paths) {
          if (!opts.quiet) process.stderr.write(`Uploading ${p}…\n`);
          await uploadDir(siftId, p, g);
        }

        if (opts.wait !== false) {
          if (!opts.quiet) process.stderr.write("Processing…\n");
          await waitForSift(client, siftId);
          const sift = await client.getSift(siftId);
          const records = await sift.records();
          const data = records.map((r: { extracted_data?: unknown }) => r.extracted_data ?? r);
          autoFormat(data, !!opts.json);
        } else {
          if (!opts.quiet) process.stderr.write(`Sift ID: ${siftId}\n`);
        }
      } catch (e) { err(String(e)); process.exit(2); }
    });
}
