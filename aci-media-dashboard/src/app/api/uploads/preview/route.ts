import { getStore } from "@/store/client";
import { previewUploads } from "@/server/ingest";
import { failure, json, readUploadRequest } from "@/server/upload-request";

/** Preview of the chosen files. Admin only; checked before the body is read. */
export async function POST(req: Request): Promise<Response> {
  try {
    const r = await readUploadRequest(req);
    if (!r.ok) return json({ error: r.error }, r.status);
    return json({ error: null, ok: true, previews: await previewUploads(await getStore(), r.inputs) });
  } catch (e) {
    return failure(e);
  }
}
