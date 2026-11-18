"use client";

import { useActionState, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ActionState } from "@/server/action-state";

type Action = (prev: ActionState, fd: FormData) => Promise<ActionState>;

const HiddenFields = ({ fields }: { fields: Record<string, string> }) =>
  Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />);

/**
 * A button that opens a dialog with one form. Closes on success; the store's message shows as the form error.
 * Admin only: the server page renders it only for the admin, and every action checks again.
 */
export function FormDialog({
  trigger, triggerLabel, primary = false, title, submit, action, fields = {}, children,
}: {
  trigger: string;
  /** Accessible name when the visible text alone is ambiguous, e.g. "Rename Toiletries". */
  triggerLabel?: string;
  primary?: boolean;
  title: string;
  submit: string;
  action: Action;
  fields?: Record<string, string>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" size={primary ? "default" : "sm"} variant={primary ? "default" : "outline"} aria-label={triggerLabel} onClick={() => setOpen(true)}>
        {primary && <Plus aria-hidden />}
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          {open && (
            <DialogForm title={title} submit={submit} action={action} fields={fields} onDone={() => setOpen(false)}>
              {children}
            </DialogForm>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function DialogForm({
  title, submit, action, fields, onDone, children,
}: { title: string; submit: string; action: Action; fields: Record<string, string>; onDone: () => void; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(async (prev: ActionState, fd: FormData) => {
    const res = await action(prev, fd);
    if (res.ok) onDone();
    return res;
  }, { error: null });
  return (
    <form action={formAction} aria-busy={pending} className="grid gap-5">
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <HiddenFields fields={fields} />
      <div className="grid gap-4">{children}</div>
      {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={pending}>{submit}</Button>
      </DialogFooter>
    </form>
  );
}

/** Hide / Show for one row. Sends the new state; the server checks the admin and the slug or id. */
export function HideToggle({ action, fields, hidden, name }: { action: Action; fields: Record<string, string>; hidden: boolean; name: string }) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  const verb = hidden ? "Show" : "Hide";
  return (
    <form action={formAction} aria-busy={pending} className="inline-flex flex-col items-end">
      <HiddenFields fields={{ ...fields, hidden: String(!hidden) }} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} aria-label={`${verb} ${name}`}>{verb}</Button>
      {state.error && <p role="alert" className="max-w-48 text-right text-xs text-red-700">{state.error}</p>}
    </form>
  );
}
