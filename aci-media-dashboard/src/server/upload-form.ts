import { MAX_FILE_BYTES } from "@/store/files";
import { isFileType } from "@/lib/ingest/file-types";
import { ValidationError } from "@/server/errors";
import { DecisionsSchema, MAX_FILES, type Decisions, type UploadInput } from "@/server/ingest";

export const TOO_BIG = "The files together are larger than 60 MB. Upload them in smaller groups.";

/** Far more than 500 brand decisions need; a longer field is ignored without being parsed. */
const MAX_DECISIONS_CHARS = 256 * 1024;

/** One file's `decisions-<i>` field. Anything that is not valid JSON in the decisions shape is ignored (null), like an unknown `type-<i>`. */
export function parseDecisions(v: FormDataEntryValue | null): Decisions | null {
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_DECISIONS_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(v);
  } catch {
    return null;
  }
  const parsed = DecisionsSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Reads the upload form. Empty files are refused (not dropped) so `type-<i>` and `decisions-<i>` always match the browser's file order. */
export async function readUploadForm(fd: FormData): Promise<UploadInput[]> {
  const files = fd.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) throw new ValidationError("Choose at least one Excel file.");
  if (files.length > MAX_FILES) throw new ValidationError("Upload at most 30 files at a time.");
  const empty = files.find((f) => f.size === 0);
  if (empty) throw new ValidationError(`${empty.name} is empty.`);
  if (files.reduce((t, f) => t + f.size, 0) > MAX_FILE_BYTES) throw new ValidationError(TOO_BIG);
  return Promise.all(files.map(async (f, i) => {
    const t = fd.get(`type-${i}`);
    return { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), chosenType: isFileType(t) ? t : null, decisions: parseDecisions(fd.get(`decisions-${i}`)) };
  }));
}
