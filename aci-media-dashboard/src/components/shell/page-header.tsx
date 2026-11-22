import type { ReactNode } from "react";

/**
 * Wix-style page title: bold title (with an optional count), one line of help,
 * page actions always on the right in the same place (Fitts's and Jakob's laws).
 */
export function PageHeader({ title, subtitle, count, children }: { title: string; subtitle?: string; count?: number; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900 md:text-[30px]">
          {title}
          {count !== undefined && <span className="ml-2 font-normal text-gray-400">{count}</span>}
        </h1>
        {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {children && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}
