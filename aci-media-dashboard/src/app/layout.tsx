import type { Metadata } from "next";
import { Suspense } from "react";
import { DM_Sans } from "next/font/google";
import { AgentationDev } from "@/components/dev/agentation-dev";
import { AdminOnly } from "@/components/shell/admin-only";
import { AdminStatus } from "@/components/shell/admin-status";
import { QuickActions } from "@/components/shell/quick-actions";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: { default: "ACI Media Dashboard", template: "%s · ACI Media" },
  description: "Plan, spend, performance, digital, competitors and billing in one place",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full antialiased`}>
      <body className="min-h-full bg-background text-foreground">
        <div className="flex min-h-screen flex-col md:flex-row">
          <aside className="bg-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0">
            <Sidebar
              quickActionsSlot={
                <Suspense fallback={null}>
                  <AdminOnly><div className="hidden px-4 pb-4 md:block"><QuickActions /></div></AdminOnly>
                </Suspense>
              }
            />
          </aside>
          <main className="min-w-0 flex-1">
            <TopBar
              quickActionsSlot={
                <Suspense fallback={null}>
                  <AdminOnly><div className="w-36 sm:w-44 md:hidden"><QuickActions /></div></AdminOnly>
                </Suspense>
              }
              adminSlot={<Suspense fallback={null}><AdminStatus /></Suspense>}
            />
            <div className="mx-auto max-w-[1440px] px-4 py-6 md:px-10 md:py-8">{children}</div>
          </main>
        </div>
        <Toaster />
        {process.env.NODE_ENV === "development" && <AgentationDev />}
      </body>
    </html>
  );
}
