"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/auth/admin";
import { getDb } from "@/db/client";
import {
  deleteCompetitorAd, deleteCompetitorMedia, saveCompetitorAd, saveCompetitorMedia, saveYoutubeMonth, setSourceOwner,
  type CompetitorAdInput, type CompetitorMediaInput, type SourceKey, type YoutubeRowInput,
} from "@/server/competitors";
import { toActionError, type ActionState } from "@/server/action-state";

async function run(work: () => Promise<unknown>): Promise<ActionState> {
  try {
    await requireAdmin();
    await work();
    for (const p of ["/competitors", "/"]) revalidatePath(p);
    return { error: null, ok: true };
  } catch (e) {
    return toActionError(e);
  }
}

export async function saveMediaAction(id: number | null, input: CompetitorMediaInput) {
  return run(() => saveCompetitorMedia(getDb(), id, input));
}

export async function deleteMediaAction(id: number) {
  return run(() => deleteCompetitorMedia(getDb(), id));
}

export async function saveAdAction(id: number | null, input: CompetitorAdInput) {
  return run(() => saveCompetitorAd(getDb(), id, input));
}

export async function deleteAdAction(id: number) {
  return run(() => deleteCompetitorAd(getDb(), id));
}

export async function saveYoutubeAction(input: { brandId: number; month: string; rows: YoutubeRowInput[] }) {
  return run(() => saveYoutubeMonth(getDb(), input));
}

export async function setOwnerAction(key: SourceKey, ownerName: string) {
  return run(() => setSourceOwner(getDb(), key, ownerName));
}
