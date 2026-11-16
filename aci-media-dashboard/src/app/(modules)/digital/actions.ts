"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import { deleteDigitalEntry, saveDigitalEntry, type DigitalInput } from "@/server/digital";
import { toActionError, type ActionState } from "@/server/action-state";

const done = (): ActionState => {
  for (const p of ["/digital", "/"]) revalidatePath(p);
  return { error: null, ok: true };
};

export async function saveDigitalAction(id: number | null, input: DigitalInput): Promise<ActionState> {
  try {
    await requireAdmin();
    await saveDigitalEntry(getDb(), id, input);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteDigitalAction(id: number): Promise<ActionState> {
  try {
    await requireAdmin();
    await deleteDigitalEntry(getDb(), id);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
