import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { autoFormat, ok, err } from "../output.js";
import { makeClient, type GlobalOpts } from "../client.js";

async function uploadToFolder(folderId: string, inputPath: string, opts: GlobalOpts, quiet: boolean): Promise<number> {
  const s = await stat(inputPath);
  const files = s.isDirectory()
    ? (await readdir(inputPath, { recursive: true }))
        .map(f => join(inputPath, f))
    : [inputPath];

  const { stat: statFn } = await import("node:fs/promises");
  const fileList: string[] = [];
  for (const f of files) {
    const fs = await statFn(f);
    if (fs.isFile()) fileList.push(f);
  }

  if (fileList.length === 0) {
    err("No files found.");
    process.exit(1);
  }

  const { readFile } = await import("node:fs/promises");
  const { basename } = await import("node:path");

  for (const filepath of fileList) {
    if (!quiet) process.stderr.write(`  Uploading ${basename(filepath)}…\n`);
    const bytes = await readFile(filepath);
    const form = new FormData();
    form.append("file", new Blob([bytes]), basename(filepath));
    const res = await fetch(`${opts.apiUrl}/api/folders/${folderId}/documents`, {
      method: "POST",
      headers: { "X-API-Key": opts.apiKey },
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
  }
  return fileList.length;
}

export function foldersCommand(globals: () => GlobalOpts): Command {
  const cmd = new Command("folders").description("Manage folders and upload documents");

  cmd
    .command("list")
    .description("List all folders")
    .option("--limit <n>", "Max results", "50")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const folders = await makeClient(globals()).listFolders(parseInt(opts.limit));
        autoFormat(folders.map(f => ({ id: f.id, name: f.name, documents: f.document_count })), !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("create")
    .description("Create a new folder")
    .requiredOption("-n, --name <name>", "Folder name")
    .option("--description <text>", "Description", "")
    .option("--json", "Output as JSON")
    .action(async (opts) => {
      try {
        const f = await makeClient(globals()).createFolder(opts.name, opts.description);
        autoFormat({ id: f.id, name: f.name }, !!opts.json);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("upload <folder-id> <path>")
    .description("Upload a file or directory to a folder")
    .option("--quiet", "Suppress per-file output")
    .action(async (folderId, inputPath, opts) => {
      try {
        const g = globals();
        const count = await uploadToFolder(folderId, inputPath, g, !!opts.quiet);
        ok(`Uploaded ${count} file(s).`);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  cmd
    .command("link <folder-id> <sift-id>")
    .description("Link a sift to a folder")
    .action(async (folderId, siftId) => {
      try {
        const folder = await makeClient(globals()).getFolder(folderId);
        const sift = await makeClient(globals()).getSift(siftId);
        await folder.addSift(sift);
        ok(`Linked folder ${folderId} → sift ${siftId}.`);
      } catch (e) { err(String(e)); process.exit(2); }
    });

  return cmd;
}
