import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Sifter } from "@sifter-ai/sdk";

export interface GlobalOpts {
  apiUrl: string;
  apiKey: string;
}

export function makeClient(opts: GlobalOpts): Sifter {
  if (!opts.apiKey) {
    console.error("Error: API key required. Set SIFTER_API_KEY or use --api-key.");
    process.exit(1);
  }
  return new Sifter({ apiUrl: opts.apiUrl, apiKey: opts.apiKey });
}

export async function uploadDir(siftId: string, dirPath: string, opts: GlobalOpts): Promise<void> {
  const stat = await import("node:fs/promises").then(m => m.stat(dirPath));
  const filenames = stat.isDirectory()
    ? (await readdir(dirPath)).filter(f => !f.startsWith("."))
    : [dirPath];

  const form = new FormData();
  for (const filename of filenames) {
    const fullPath = stat.isDirectory() ? join(dirPath, filename) : filename;
    const bytes = await readFile(fullPath);
    form.append("files", new Blob([bytes]), filename);
  }

  const res = await fetch(`${opts.apiUrl}/api/sifts/${siftId}/upload`, {
    method: "POST",
    headers: { "X-API-Key": opts.apiKey },
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
}

export async function waitForSift(client: Sifter, siftId: string): Promise<void> {
  while (true) {
    const sift = await client.getSift(siftId);
    if (sift.status !== "indexing") {
      if (sift.status === "error") throw new Error("Extraction failed");
      return;
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}
