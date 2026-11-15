import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/auth/admin";
import { signOutAction } from "@/app/sign-in/actions";

const pill = "whitespace-nowrap rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 hover:text-gray-900";

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
    <form action={signOutAction} className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <span className="whitespace-nowrap rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">Admin</span>
      <a href="/api/backup" className={`${pill} hidden sm:inline`} title="Backup of the Media Mind store. Data still on the old pages is not included yet.">Download backup</a>
      <button type="submit" className={pill}>Sign out</button>
    </form>
  );
}
