import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/calendar");

export default function Page() {
  return <BeingBuilt href="/calendar" />;
}
