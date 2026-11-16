"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { restoreVersionAction } from "./actions";

export function RestoreVersionButton({ versionId, label }: { versionId: number; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => {
        if (!confirm(`Use this upload for ${label} again? Only that dataset changes.`)) return;
        startTransition(async () => {
          const res = await restoreVersionAction(versionId);
          if (res.error) toast.error(res.error);
          else toast.success(`Restored. ${label} uses this upload again.`);
        });
      }}
    >
      Restore
    </Button>
  );
}
