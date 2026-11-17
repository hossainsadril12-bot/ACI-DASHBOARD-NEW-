import type { DigitalBusiness } from "@/lib/ingest/brands";
import type { FileType } from "@/lib/ingest/file-types";
import type { FilePreview } from "@/server/ingest";

// Pure helpers for the Data Entry page. Safe for the browser: types only from the server.

export type RowStatus = "ready" | "needs-type" | "needs-business" | "blocked";
export const NEEDS_TYPE = "Pick the file type.";

export function rowStatus(p: FilePreview): RowStatus {
  if (p.canPublish) return "ready";
  if (p.needsBusiness) return "needs-business";
  return p.blockReason === NEEDS_TYPE ? "needs-type" : "blocked";
}

/** The block reason in grey, unless it is already shown in the red error list. */
export function greyReason(p: FilePreview): string | null {
  return p.blockReason && !p.errors.includes(p.blockReason) ? p.blockReason : null;
}

/** Publish only when every chosen file has a preview and every one is ready. */
export function canPublishAll(previews: FilePreview[] | null, fileCount: number): boolean {
  return previews !== null && fileCount > 0 && previews.length === fileCount && previews.every((p) => p.canPublish);
}

const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
export const publishButtonLabel = (n: number) => `Publish ${files(n)}`;
export const publishedMessage = (published: { label: string }[]) =>
  `Published ${files(published.length)}: ${published.map((p) => p.label).join("; ")}`;

export const whenDhaka = (d: Date) =>
  d.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Dhaka" });

/** Repeated `files`, plus `type-<i>` / `business-<i>` only for the rows where the admin picked one. The server re-checks both. */
export function uploadForm(list: File[], types: (FileType | "")[], businesses: (DigitalBusiness | "")[]): FormData {
  const fd = new FormData();
  list.forEach((f, i) => {
    fd.append("files", f);
    if (types[i]) fd.set(`type-${i}`, types[i]);
    if (businesses[i]) fd.set(`business-${i}`, businesses[i]);
  });
  return fd;
}

const FAILED = "Something went wrong. Please try again.";
const NOT_SENT = "The files could not be sent. Check the connection and try again.";

/** POSTs to an upload route. A refusal's `error` is returned as is; anything else becomes a plain message. */
export async function postUploads<T extends object>(url: string, body: FormData): Promise<Partial<T> & { error: string | null }> {
  type Reply = Partial<T> & { error: string | null };
  const fail = (error: string) => ({ error }) as Reply;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", body });
  } catch {
    return fail(NOT_SENT);
  }
  const json = (await res.json().catch(() => null)) as (Partial<T> & { error?: unknown }) | null;
  if (!json || typeof json !== "object") return fail(FAILED);
  if (!res.ok) return fail(typeof json.error === "string" && json.error ? json.error : FAILED);
  return { ...json, error: typeof json.error === "string" ? json.error : null };
}
