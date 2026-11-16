import { isAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { getFile } from "@/store/files";

const text = (body: string, status: number) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

/** filename= is plain ASCII with quotes, backslashes and control characters replaced; filename*= keeps the real name. */
function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
}

/** The original uploaded file, unchanged. Admin only (viewers get Source Excel downloads in Phase 5). */
export async function GET(_req: Request, ctx: RouteContext<"/api/uploads/[fileId]">): Promise<Response> {
  if (!(await isAdmin())) return text("Only the admin can download uploaded files. Please sign in.", 403);
  const raw = (await ctx.params).fileId;
  const id = /^\d{1,12}$/.test(raw) ? Number(raw) : NaN;
  if (!Number.isSafeInteger(id) || id < 1) return text("Not found.", 404);
  const f = await getFile(await getStore(), id);
  if (!f) return text("Not found.", 404);
  return new Response(new Uint8Array(f.bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": contentDisposition(f.name),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
