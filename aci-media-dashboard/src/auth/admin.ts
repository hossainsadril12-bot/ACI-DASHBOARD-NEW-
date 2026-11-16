import { cookies } from "next/headers";
import { getStore } from "@/store/client";
import { ValidationError } from "@/server/errors";
import { can } from "./policy";
import { SESSION_COOKIE, isValidSession } from "./session";

export const NOT_ADMIN_MESSAGE = "Only the admin can change data. Please sign in.";

export class NotAdminError extends ValidationError {
  constructor() {
    super(NOT_ADMIN_MESSAGE);
    this.name = "NotAdminError";
  }
}

/** True when this request carries a valid admin session. Reads cookies(), so call it inside a Suspense boundary. */
export async function isAdmin(): Promise<boolean> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return isValidSession(await getStore(), token);
}

/** The first line of every write. Viewers get NotAdminError, which actions turn into the plain refusal message. */
export async function requireAdmin(): Promise<void> {
  const viewer = (await isAdmin()) ? ({ kind: "admin" } as const) : ({ kind: "viewer" } as const);
  if (!can(viewer, "write")) throw new NotAdminError();
}
