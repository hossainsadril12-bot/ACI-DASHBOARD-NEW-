import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/auth/admin";
import { signOutAction } from "@/app/sign-in/actions";

const pill = "rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900";

/** Reads the session cookie, so the layout renders it inside <Suspense>. */
export async function AdminStatus() {
  await connection();
  if (!(await isAdmin())) {
    return (
      <Link href="/sign-in" className={pill}>
        Admin sign in
      </Link>
    );
  }
  return (
    <form action={signOutAction} className="flex items-center gap-2">
      <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Admin</span>
      <a href="/api/backup" className={pill}>Download backup</a>
      <button type="submit" className={pill}>Sign out</button>
    </form>
  );
}
