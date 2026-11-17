import { MAX_FILE_BYTES } from "@/store/files";
import { isFileType } from "@/lib/ingest/file-types";
import { isDigitalBusiness } from "@/lib/ingest/brands";
import { ValidationError } from "@/server/errors";
import { MAX_FILES, type UploadInput } from "@/server/ingest";

export const TOO_BIG = "The files together are larger than 60 MB. Upload them in smaller groups.";

/** Reads the upload form. Empty files are refused (not dropped) so `type-<i>` and `business-<i>` always match the browser's file order. */
export async function readUploadForm(fd: FormData): Promise<UploadInput[]> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (files.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
  const empty = files.find((f) => f.size === 0);
  if (empty) throw new ValidationError(`${empty.name} is empty.`);
  if (files.reduce((t, f) => t + f.size, 0) > MAX_FILE_BYTES) throw new ValidationError(TOO_BIG);
  return Promise.all(files.map(async (f, i) => {
    const t = fd.get(`type-${i}`);
    const b = fd.get(`business-${i}`);
    return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), chosenType: isFileType(t) ? t : null, chosenBusiness: isDigitalBusiness(b) ? b : null };
  }));
}
