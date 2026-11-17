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
    await file.cleanup();
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

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) {
    return new Response("Only the admin can download a backup. Please sign in.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const file = await createBackupFile(await getStore());
  return new Response(streamThenCleanup(file), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Content-Length": String(file.size),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
