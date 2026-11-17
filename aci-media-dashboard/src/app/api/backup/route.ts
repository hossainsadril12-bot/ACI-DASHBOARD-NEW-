import { createReadStream } from "node:fs";
import { isAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { backupFileName, createBackupFile, type BackupFile } from "@/store/backup";

/** Streams the temp file, then deletes it once the read stream is closed: on end, on error and on cancel. */
function streamThenCleanup(file: BackupFile): ReadableStream<Uint8Array> {
  const source = createReadStream(file.path);
  const closed = new Promise<void>((resolve) => source.once("close", resolve));
  const chunks = source[Symbol.asyncIterator]();
  // The file must be closed before it can be removed on Windows.
  const finish = async () => {
    source.destroy();
    await closed;
    try {
      await file.cleanup();
    } catch (e) {
      // A finished download stays finished. Log the code only: the error message holds the temp file path.
      const err = e as NodeJS.ErrnoException;
      console.error("Backup temp file could not be removed:", err?.code ?? err?.name ?? "unknown");
    }
  };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) {
          await finish();
          controller.close();
        } else {
          controller.enqueue(value as Buffer);
        }
      } catch {
        await finish();
        controller.error(new Error("The backup could not be read."));
      }
    },
    async cancel() {
      await finish();
    },
  });
}

const FORBIDDEN = "Only the admin can download a backup. Please sign in.";

function downloadHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/vnd.sqlite3",
    "Content-Disposition": `attachment; filename="${backupFileName()}"`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
}

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) {
    return new Response(FORBIDDEN, { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const file = await createBackupFile(await getStore());
  return new Response(streamThenCleanup(file), { headers: { ...downloadHeaders(), "Content-Length": String(file.size) } });
}

/** Without this, Next answers HEAD by running GET and never reads the body, so the temp copy would stay on disk. */
export async function HEAD(): Promise<Response> {
  if (!(await isAdmin())) {
    return new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  return new Response(null, { status: 200, headers: downloadHeaders() });
}
