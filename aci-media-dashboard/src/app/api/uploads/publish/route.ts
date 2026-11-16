import { revalidatePath } from "next/cache";
import { getStore } from "@/store/client";
import { publishUploads } from "@/server/ingest";
import { failure, json, readUploadRequest } from "@/server/upload-request";

/** Publishes the chosen files. Admin only; checked before the body is read. */
export async function POST(req: Request): Promise<Response> {
  try {
    const r = await readUploadRequest(req);
    if (!r.ok) return json({ error: r.error }, r.status);
    const { published } = await publishUploads(await getStore(), r.inputs);
    revalidatePath("/data-entry");
    return json({ error: null, ok: true, published });
  } catch (e) {
    return failure(e);
  }
}
