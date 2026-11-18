import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

/** Wix-style empty area: icon, one line of what is missing, one line of what to do next. */
export function EmptyState({ title, message, children, icon: Icon = Inbox }: { title: string; message?: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-6 py-12 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-white text-gray-400 shadow-xs ring-1 ring-gray-200" aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="font-medium text-gray-900">{title}</p>
      {message && <p className="max-w-md text-sm text-gray-500">{message}</p>}
      {children && <div className="mt-3 flex gap-2">{children}</div>}
    </div>
  );
}
