import { isAdmin, NOT_ADMIN_MESSAGE } from "@/auth/admin";
import { MAX_FILE_BYTES } from "@/store/files";
import { ValidationError } from "@/server/errors";
import { type UploadInput } from "@/server/ingest";
import { readUploadForm, TOO_BIG } from "@/server/upload-form";

const CAP = MAX_FILE_BYTES + 1024 * 1024; // room for multipart framing

export type UploadRequest = { ok: true; inputs: UploadInput[] } | { ok: false; status: number; error: string };
const refuse = (status: number, error: string): UploadRequest => ({ ok: false, status, error });

/** JSON with no-store, for both upload routes. */
export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

/** Checks admin, origin and size before touching the body, then reads the multipart form. */
export async function readUploadRequest(req: Request): Promise<UploadRequest> {
  if (!(await isAdmin())) return refuse(403, NOT_ADMIN_MESSAGE);

  const origin = req.headers.get("origin");
  if (origin !== null) {
    let originHost: string | null = null;
    try { originHost = new URL(origin).host; } catch { /* treated as cross-site */ }
    const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const expected = forwarded || req.headers.get("host") || new URL(req.url).host;
    if (originHost === null || originHost !== expected) return refuse(403, "Cross-site upload refused.");
  }

  const len = req.headers.get("content-length");
  if (len === null || !/^\d{1,15}$/.test(len) || Number(len) > CAP) return refuse(413, TOO_BIG);

  const chunks: Uint8Array[] = [];
  let total = 0;
  if (req.body) {
    const reader = req.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > CAP) { await reader.cancel().catch(() => {}); return refuse(413, TOO_BIG); }
      chunks.push(value);
    }
  }

  let fd: FormData;
  try {
    const joined = Buffer.concat(chunks);
    chunks.length = 0;
    fd = await new Response(joined, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
  } catch {
    return refuse(400, "The upload could not be read. Please try again.");
  }
  try {
    return { ok: true, inputs: await readUploadForm(fd) };
  } catch (e) {
    if (e instanceof ValidationError) return refuse(400, e.message);
    throw e;
  }
}

/** Turns an unexpected failure into a safe 500; ValidationError becomes 400. */
export function failure(e: unknown): Response {
  if (e instanceof ValidationError) return json({ error: e.message }, 400);
  console.error(e);
  return json({ error: "Something went wrong. Please try again." }, 500);
}
