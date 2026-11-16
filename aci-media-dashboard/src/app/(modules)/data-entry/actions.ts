"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { restoreVersion } from "@/store/datasets";
import { MAX_FILE_BYTES } from "@/store/files";
import { isFileType } from "@/lib/ingest/file-types";
import { ValidationError } from "@/server/errors";
import { toActionError, type ActionState } from "@/server/action-state";
import { MAX_FILES, previewUploads, publishUploads, type FilePreview, type UploadInput } from "@/server/ingest";

async function readUploadForm(fd: FormData): Promise<UploadInput[]> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (files.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
  if (files.reduce((t, f) => t + f.size, 0) > MAX_FILE_BYTES) throw new ValidationError("The files together are larger than 60 MB. Upload them in smaller groups.");
  return Promise.all(files.map(async (f, i) => {
    const t = fd.get(`type-${i}`);
    return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), chosenType: isFileType(t) ? t : null };
  }));
}

export async function previewUploadsAction(fd: FormData): Promise<ActionState & { previews?: FilePreview[] }> {
  try {
    await requireAdmin();
    return { error: null, ok: true, previews: await previewUploads(await getStore(), await readUploadForm(fd)) };
  } catch (e) {
    return toActionError(e);
  }
}

export async function publishUploadsAction(fd: FormData): Promise<ActionState & { published?: { datasetKey: string; label: string; versionId: number }[] }> {
  try {
    await requireAdmin();
    const { published } = await publishUploads(await getStore(), await readUploadForm(fd));
    revalidatePath("/data-entry");
    return { error: null, ok: true, published };
  } catch (e) {
    return toActionError(e);
  }
}

export async function restoreVersionAction(versionId: number): Promise<ActionState> {
  try {
    await requireAdmin();
    if (!Number.isInteger(versionId) || versionId < 1) throw new ValidationError("That upload no longer exists.");
    await restoreVersion(await getStore(), versionId);
    revalidatePath("/data-entry");
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
