export class SifterError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "SifterError";
    this.status = status;
    this.body = body;
  }
}

export async function assertOk(res: Response): Promise<void> {
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }
    const detail =
      typeof body === "object" && body !== null && "detail" in body
        ? String((body as { detail: unknown }).detail)
        : typeof body === "string" && body.length > 0
          ? body
          : res.statusText;
    throw new SifterError(detail, res.status, body);
  }
}
