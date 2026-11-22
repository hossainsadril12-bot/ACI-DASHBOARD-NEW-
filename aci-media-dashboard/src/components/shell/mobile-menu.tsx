"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Calls `onChange` whenever the path or the `tab` param changes. Reads URL data, so it sits in Suspense. */
function RouteWatcher({ onChange }: { onChange: () => void }) {
  const pathname = usePathname();
  const tab = useSearchParams().get("tab");
  useEffect(() => {
    onChange();
  }, [pathname, tab, onChange]);
  return null;
}

/** Phones only: a "Menu" button that opens the sidebar as a left drawer, closed again on navigation. */
export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  return (
    <div className="md:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="ghost" size="lg" className="-ml-2 h-10 min-w-10" />}>
          <Menu aria-hidden />
          Menu
        </DialogTrigger>
        <DialogContent
          showCloseButton={false}
          className="data-open:zoom-in-100 data-closed:zoom-out-100 top-0 left-0 flex h-full w-72 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none bg-sidebar p-0 text-sidebar-foreground ring-0 sm:max-w-[85vw] md:hidden data-open:slide-in-from-left data-closed:slide-out-to-left"
        >
          <DialogTitle className="sr-only">Menu</DialogTitle>
          <DialogClose render={<Button variant="ghost" className="absolute top-2 right-2 size-10" aria-label="Close" />}>
            <X aria-hidden />
          </DialogClose>
          {/* Any link chosen closes the drawer, even one to the page already shown. */}
          <div className="contents" onClick={(e) => { if ((e.target as Element).closest("a")) close(); }}>
            {children}
          </div>
        </DialogContent>
      </Dialog>
      <Suspense fallback={null}>
        <RouteWatcher onChange={close} />
      </Suspense>
    </div>
  );
}
