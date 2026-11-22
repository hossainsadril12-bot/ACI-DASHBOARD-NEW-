import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import type { CardKey } from "@/lib/ingest/cards";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState } from "./empty-state";

/** A built page with no data: names the file; the admin can jump to its upload card. */
export function NoDataYet({ fileName, card, admin }: { fileName: string; card: CardKey | null; admin: boolean }) {
  return (
    <EmptyState icon={FileSpreadsheet} title="No data yet" message={`This page needs the ${fileName} file.`}>
      {admin && card ? (
        <Link href={`/data-entry#card-${card}`} className={cn(buttonVariants())}>Upload it</Link>
      ) : (
        !admin && <p className="text-sm text-gray-500">Not uploaded yet. The admin uploads it in Data Entry.</p>
      )}
    </EmptyState>
  );
}
