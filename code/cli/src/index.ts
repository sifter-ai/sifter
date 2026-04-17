#!/usr/bin/env node
/**
 * sifter — Sifter CLI
 *
 * Usage:
 *   SIFTER_API_KEY=sk-... sifter sifts list
 *   sifter --api-key sk-... extract ./docs/ -i "date, total, supplier"
 *
 * Authentication:
 *   Set SIFTER_API_KEY env var, or pass --api-key on every command.
 *   Set SIFTER_BASE_URL to point at a non-default server.
 */
import { Command } from "commander";
import { siftsCommand } from "./commands/sifts.js";
import { foldersCommand } from "./commands/folders.js";
import { recordsCommand } from "./commands/records.js";
import { extractCommand } from "./commands/extract.js";
import type { GlobalOpts } from "./client.js";

const program = new Command();

program
  .name("sifter")
  .description("Sifter CLI — document extraction from the command line")
  .version("0.1.0")
  .option("--api-url <url>", "Sifter server URL", process.env["SIFTER_BASE_URL"] ?? "http://localhost:8000")
  .option("--api-key <key>", "API key", process.env["SIFTER_API_KEY"] ?? "");

function globals(): GlobalOpts {
  const opts = program.opts<{ apiUrl: string; apiKey: string }>();
  return { apiUrl: opts.apiUrl, apiKey: opts.apiKey };
}

program.addCommand(siftsCommand(globals));
program.addCommand(foldersCommand(globals));
program.addCommand(recordsCommand(globals));
program.addCommand(extractCommand(globals));

program.parseAsync(process.argv).catch(e => {
  console.error(e);
  process.exit(1);
});
