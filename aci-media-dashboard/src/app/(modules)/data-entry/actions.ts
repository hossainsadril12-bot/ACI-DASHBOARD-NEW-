"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore, type Store } from "@/store/client";
import { restoreVersion } from "@/store/datasets";
import { ValidationError } from "@/server/errors";
import { changeBillboard, saveChannel, saveFy, type ManualSaved } from "@/server/manual-entry";
import { toActionError, type ActionState, type ManualSaveState } from "@/server/action-state";

export async function restoreVersionAction(versionId: number): Promise<ActionState> {
  try {
    await requireAdmin();
    if (!Number.isInteger(versionId) || versionId < 1) throw new ValidationError("That upload no longer exists.");
    await restoreVersion(await getStore(), versionId);
    revalidatePath("/data-entry");
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

/** The admin check first, then the save; the service parses and checks every value. */
async function manualSave(save: (store: Store) => Promise<ManualSaved>): Promise<ManualSaveState> {
  try {
    await requireAdmin();
    const { versionId, summary } = await save(await getStore());
    revalidatePath("/data-entry");
    return { error: null, ok: true, versionId, summary };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveChannelAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => saveChannel(store, input));
}

export async function saveFyAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => saveFy(store, input));
}

export async function changeBillboardAction(input: unknown): Promise<ManualSaveState> {
  return manualSave((store) => changeBillboard(store, input));
}
