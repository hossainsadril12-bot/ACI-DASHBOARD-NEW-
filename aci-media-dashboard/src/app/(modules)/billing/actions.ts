"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import { todayDhaka } from "@/lib/month";
import {
  billHistory, deleteBill, markBillPaid, remindBill, remindOverdue, resolveReminder, saveBill, setBillNote, type BillInput,
} from "@/server/billing";
import { toActionError, type ActionState } from "@/server/action-state";

async function run(work: () => Promise<unknown>): Promise<ActionState> {
  try {
    await requireAdmin();
    await work();
    for (const p of ["/billing", "/"]) revalidatePath(p);
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveBillAction(id: number | null, input: BillInput) {
  return run(() => saveBill(getDb(), id, input));
}

export async function deleteBillAction(id: number) {
  return run(() => deleteBill(getDb(), id));
}

export async function markPaidAction(id: number) {
  return run(() => markBillPaid(getDb(), id, todayDhaka()));
}

export async function remindAction(id: number) {
  return run(() => remindBill(getDb(), id));
}

export async function resolveReminderAction(reminderId: number) {
  return run(() => resolveReminder(getDb(), reminderId));
}

export async function setNoteAction(id: number, note: string) {
  return run(() => setBillNote(getDb(), id, note));
}

export async function billHistoryAction(id: number) {
  const rows = await billHistory(getDb(), id);
  return rows.map((h) => ({ id: h.id, at: h.at, action: h.action, reason: h.reason, after: h.after as { status?: string } | null }));
}

export async function remindOverdueAction(): Promise<ActionState & { added?: number }> {
  let added = 0;
  const res = await run(async () => {
    added = await remindOverdue(getDb(), todayDhaka());
  });
  return { ...res, added };
}
