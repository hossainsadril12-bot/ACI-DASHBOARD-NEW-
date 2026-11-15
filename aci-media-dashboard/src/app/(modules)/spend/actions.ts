"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import { createSpendEntry, deleteSpendEntry, updateSpendEntry, type SpendInput } from "@/server/spend";
import { toActionError, type ActionState } from "@/server/action-state";

const done = (): ActionState => {
  for (const p of ["/spend", "/plan", "/"]) revalidatePath(p);
  return { error: null, ok: true };
};

export async function saveSpendAction(id: number | null, input: SpendInput): Promise<ActionState> {
  try {
    await requireAdmin();
    if (id) await updateSpendEntry(getDb(), id, input);
    else await createSpendEntry(getDb(), input);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteSpendAction(id: number): Promise<ActionState> {
  try {
    await requireAdmin();
    await deleteSpendEntry(getDb(), id);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
