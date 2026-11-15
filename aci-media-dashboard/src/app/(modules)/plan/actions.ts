"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import { createCampaign, deleteCampaign, setBudget, updateCampaign, type CampaignInput } from "@/server/plan";
import { toActionError, type ActionState } from "@/server/action-state";

const done = (): ActionState => {
  revalidatePath("/plan");
  revalidatePath("/");
  return { error: null, ok: true };
};

export async function saveCampaignAction(id: number | null, input: CampaignInput): Promise<ActionState> {
  try {
    await requireAdmin();
    if (id) await updateCampaign(getDb(), id, input);
    else await createCampaign(getDb(), input);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function deleteCampaignAction(id: number): Promise<ActionState> {
  try {
    await requireAdmin();
    await deleteCampaign(getDb(), id);
    return done();
  } catch (e) {
    return toActionError(e);
  }
}

export async function setBudgetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    await requireAdmin();
    await setBudget(getDb(), {
      brandId: Number(fd.get("brandId")),
      month: String(fd.get("month") ?? ""),
      amount: Number(String(fd.get("amount") ?? "").replace(/,/g, "")),
      reason: String(fd.get("reason") ?? ""),
    });
    return done();
  } catch (e) {
    return toActionError(e);
  }
}
