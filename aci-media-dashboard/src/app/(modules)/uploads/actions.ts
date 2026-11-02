"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { UPLOAD_KINDS, type UploadKind } from "@/lib/upload/templates";
import { ValidationError } from "@/server/errors";
import { toActionError, type ActionState } from "@/server/action-state";
import { confirmUpload, previewUpload, restoreUpload, type UploadPreview } from "@/server/uploads";

const MAX_BYTES = 4 * 1024 * 1024;

const PAGES: Record<UploadKind, string[]> = {
  plan: ["/plan"],
  spend: ["/spend", "/plan"],
  performance: ["/performance"],
  digital: ["/digital"],
  competitor_media: ["/competitors"],
  bills: ["/billing"],
};

async function readForm(fd: FormData) {
  const kind = String(fd.get("kind") ?? "") as UploadKind;
  if (!UPLOAD_KINDS.includes(kind)) throw new ValidationError("Unknown upload type");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new ValidationError("Choose a file to upload");
  if (file.size > MAX_BYTES) throw new ValidationError("File is larger than 4 MB");
  return { kind, fileName: file.name, data: new Uint8Array(await file.arrayBuffer()) };
}

function refresh(kind: UploadKind) {
  for (const p of [...PAGES[kind], "/uploads", "/"]) revalidatePath(p);
}

export async function previewUploadAction(fd: FormData): Promise<ActionState & { preview?: UploadPreview }> {
  try {
    return { error: null, ok: true, preview: await previewUpload(getDb(), await readForm(fd)) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function confirmUploadAction(
  fd: FormData,
): Promise<ActionState & { result?: { uploadId: number; inserted: number; skippedManual: number; periods: string[] } }> {
  try {
    const input = await readForm(fd);
    const result = await confirmUpload(getDb(), { ...input, acceptMismatch: fd.get("acceptMismatch") === "on" });
    refresh(input.kind);
    return { error: null, ok: true, result };
  } catch (e) {
    return toActionError(e);
  }
}

export async function restoreUploadAction(id: number, kind: UploadKind): Promise<ActionState> {
  try {
    await restoreUpload(getDb(), id);
    refresh(kind);
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
