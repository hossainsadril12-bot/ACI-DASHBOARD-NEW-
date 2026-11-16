import Link from "next/link";
import { connection } from "next/server";
import { isAdmin } from "@/auth/admin";
import { signOutAction } from "@/app/sign-in/actions";
import { buttonVariants } from "@/components/ui/button";

/** Far-right corner of the top bar: Login for viewers, backup and Sign out for the admin. Reads the session cookie, so the layout renders it inside <Suspense>. */
export async function AdminStatus() {
  await connection();
  if (!(await isAdmin())) {
    return (
      <Link href="/sign-in" className={buttonVariants({ size: "lg", className: "px-6" })}>
        Login
      </Link>
    );
  }
  return (
    <form action={signOutAction} className="flex shrink-0 items-center gap-2">
      <a
        href="/api/backup"
        className={buttonVariants({ variant: "outline", size: "lg", className: "hidden sm:inline-flex" })}
        title="Backup of the Media Mind store. Data still on the old pages is not included yet."
      >
        Download backup
      </a>
      <button type="submit" className={buttonVariants({ variant: "outline", size: "lg" })}>
        Sign out
      </button>
    </form>
  );
}
