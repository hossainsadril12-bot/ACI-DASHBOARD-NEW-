import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FILE_TYPE_LABEL, isFileType } from "@/lib/ingest/file-types";
import type { HistoryRow } from "@/store/datasets";
import { whenDhaka } from "./logic";
import { RestoreVersionButton } from "./restore-version-button";

export function HistoryTable({ rows, admin }: { rows: HistoryRow[]; admin: boolean }) {
  return (
    <Card>
      <CardHeader><CardTitle>Upload History</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState title="No uploads yet" message="Uploaded files appear here with their original file." />
        ) : (
          <div className="overflow-x-auto">
            <Table data-testid="history-table">
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead><TableHead>Type</TableHead><TableHead>What</TableHead><TableHead>File</TableHead>
                  <TableHead className="text-right">Rows</TableHead><TableHead>Status</TableHead>
                  {admin && <TableHead><span className="sr-only">Actions</span></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.versionId}>
                    <TableCell className="whitespace-nowrap">{whenDhaka(r.createdAt)}</TableCell>
                    <TableCell className="whitespace-nowrap">{isFileType(r.kind) ? FILE_TYPE_LABEL[r.kind] : r.kind}</TableCell>
                    <TableCell className="min-w-48">{r.label}</TableCell>
                    <TableCell className="max-w-56 truncate" title={r.fileName ?? undefined}>{r.fileName ?? ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{(r.summary.rowCount as number | undefined) ?? ""}</TableCell>
                    <TableCell>{r.isActive && <Badge className="bg-emerald-100 text-emerald-800">In use</Badge>}</TableCell>
                    {admin && (
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {!r.isActive && <RestoreVersionButton versionId={r.versionId} label={r.label} />}
                          {r.fileId !== null && (
                            <a href={`/api/uploads/${r.fileId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Download</a>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {rows.length > 0 && <p className="mt-2 text-xs text-gray-500">Showing the latest 200 uploads.</p>}
      </CardContent>
    </Card>
  );
}
