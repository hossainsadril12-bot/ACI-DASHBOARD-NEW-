import { connection } from "next/server";
import { getStore } from "@/store/client";
import { listActiveVersions } from "@/store/datasets";
import { dataUpdatedLine } from "./data-updated";

/** Sidebar footer: when each file was last published. Nothing for an empty store. */
export async function DataUpdatedLine() {
  await connection();
  const line = dataUpdatedLine(await listActiveVersions(await getStore()));
  if (!line) return null;
  return <p data-testid="data-updated" className="border-t border-sidebar-border px-5 pt-3 pb-5 text-xs leading-relaxed text-sidebar-foreground/60">{line}</p>;
}
