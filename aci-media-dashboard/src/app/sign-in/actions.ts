"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getStore } from "@/store/client";
import { assertStoreEnv } from "@/store/assert-store-env";
import { attemptSignIn } from "@/auth/sign-in";
import { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, deleteSession } from "@/auth/session";

export type SignInState = { error: string | null };

export async function signInAction(_prev: SignInState, fd: FormData): Promise<SignInState> {
  let adminUser: string;
  let adminPasswordHash: string;
  try {
    ({ adminUser, adminPasswordHash } = assertStoreEnv(process.env));
  } catch (e) {
    console.error("Sign-in is not set up:", e);
    return { error: "Sign-in is not set up yet. Ask the person who runs the server." };
  }
  const result = await attemptSignIn(
    await getStore(),
    { user: adminUser, passwordHash: adminPasswordHash },
    { user: String(fd.get("user") ?? "").slice(0, 200), password: String(fd.get("password") ?? "").slice(0, 200) },
  );
  if (!result.ok) return { error: result.error };
  (await cookies()).set(SESSION_COOKIE, result.token, { ...SESSION_COOKIE_OPTIONS, expires: result.expiresAt });
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  const jar = await cookies();
  await deleteSession(await getStore(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
  redirect("/");
}
