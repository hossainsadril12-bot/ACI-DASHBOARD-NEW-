"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getStore } from "@/store/client";
import { restoreVersion } from "@/store/datasets";
import { ValidationError } from "@/server/errors";
import { toActionError, type ActionState } from "@/server/action-state";

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
