import { ValidationError } from "./errors";

export type ActionState = { error: string | null; ok?: boolean };

/** What a Manual Entry save returns: the new version and its summary line, so the editor can say it is saved. */
export type ManualSaveState = ActionState & { versionId?: number; summary?: string };

export function toActionError(e: unknown): ActionState {
  if (e instanceof ValidationError) return { error: e.message };
  console.error(e);
  return { error: "Something went wrong. Please try again." };
}
