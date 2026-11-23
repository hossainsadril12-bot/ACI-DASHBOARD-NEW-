import { cache } from "react";
import { connection } from "next/server";
import { getStore } from "@/store/client";
import { listActiveVersions } from "@/store/datasets";
import { dataUpdatedLine } from "./data-updated";

/** One store read per request: the root layout renders this twice (sidebar and phone drawer). A read error hides the line. */
const loadLine = cache(async (): Promise<string | null> => {
  try {
    return dataUpdatedLine(await listActiveVersions(await getStore()));
  } catch (err) {
    console.error("DataUpdatedLine: store read failed", err);
    return null;
  }
});

/** Sidebar footer: when each file was last published. Nothing for an empty store. */
export async function DataUpdatedLine() {
  await connection();
  const line = await loadLine();
  if (!line) return null;
  return <p data-testid="data-updated" className="border-t border-sidebar-border px-5 pt-3 pb-5 text-xs leading-relaxed text-sidebar-foreground/60">{line}</p>;
}
