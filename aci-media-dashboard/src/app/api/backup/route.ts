import { isAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { backupFileName, createBackup } from "@/store/backup";

export async function GET(): Promise<Response> {
  if (!(await isAdmin())) {
    return new Response("Only the admin can download a backup. Please sign in.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const bytes = await createBackup(await getStore());
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.sqlite3",
      "Content-Disposition": `attachment; filename="${backupFileName()}"`,
      "Cache-Control": "no-store",
    },
  });
}
