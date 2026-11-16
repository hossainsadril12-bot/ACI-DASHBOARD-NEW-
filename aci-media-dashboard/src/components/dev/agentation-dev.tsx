"use client";

import dynamic from "next/dynamic";

// Dev-only feedback toolbar: click an element, add a note, copy it to the coding agent.
// NODE_ENV is inlined at build time, so a production build drops the import entirely
// and never ships the agentation package.
const Toolbar =
  process.env.NODE_ENV === "development"
    ? dynamic(() => import("agentation").then((m) => m.Agentation), { ssr: false })
    : () => null;

export function AgentationDev() {
  return <Toolbar appName="ACI Media" />;
}
