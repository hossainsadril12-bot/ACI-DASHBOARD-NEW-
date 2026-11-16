"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import { savePerformanceMonth, type PerformanceRowInput } from "@/server/performance";
import { toActionError, type ActionState } from "@/server/action-state";

export async function savePerformanceAction(input: { brandId: number; month: string; rows: PerformanceRowInput[] }): Promise<ActionState> {
  try {
    await requireAdmin();
    await savePerformanceMonth(getDb(), input);
    for (const p of ["/performance", "/"]) revalidatePath(p);
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}
