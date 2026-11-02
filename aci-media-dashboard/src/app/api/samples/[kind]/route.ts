import { todayDhaka } from "@/lib/month";
import { UPLOAD_KINDS, type UploadKind } from "@/lib/upload/templates";
import { XLSX_TYPE } from "@/server/export";
import { sampleUploadFile } from "@/server/samples";

// Sample Excel files for this month, matching the sample brands from Settings → Sample data.
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  if (!UPLOAD_KINDS.includes(kind as UploadKind)) return new Response("Unknown sample file", { status: 404 });
  const file = sampleUploadFile(kind as UploadKind, todayDhaka());
  return new Response(Buffer.from(file.data), {
    headers: { "Content-Type": XLSX_TYPE, "Content-Disposition": `attachment; filename="${file.fileName}"`, "Cache-Control": "no-store" },
  });
}
