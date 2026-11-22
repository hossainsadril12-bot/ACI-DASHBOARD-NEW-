"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { remindOverdueAction, resolveReminderAction } from "../billing/actions";

export function RemindOverdueButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="outline" disabled={pending || count === 0}
      onClick={() => startTransition(async () => {
        const res = await remindOverdueAction();
        if (res.error) toast.error(res.error);
        else toast.success(res.added ? `${res.added} reminder${res.added === 1 ? "" : "s"} added` : "Every overdue bill already has a reminder");
      })}>
      Remind
    </Button>
  );
}

export function ResolveReminderButton({ id, label }: { id: number; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button size="sm" variant="ghost" aria-label={`Done: ${label}`} disabled={pending}
      onClick={() => startTransition(async () => {
        const res = await resolveReminderAction(id);
        if (res.error) toast.error(res.error);
      })}>
      Done
    </Button>
  );
}
