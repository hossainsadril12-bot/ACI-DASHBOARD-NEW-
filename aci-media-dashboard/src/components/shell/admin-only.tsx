import type { ReactNode } from "react";
import { connection } from "next/server";
import { isAdmin } from "@/auth/admin";

/**
 * Renders its children only for the signed-in admin. Viewers get nothing.
 * Hiding is for clarity only: every write is still refused on the server for viewers.
 * Reads the session cookie, so the layout renders it inside <Suspense>.
 */
export async function AdminOnly({ children }: { children: ReactNode }) {
  await connection();
  return (await isAdmin()) ? children : null;
}
