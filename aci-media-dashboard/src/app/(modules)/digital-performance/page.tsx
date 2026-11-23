import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/digital-performance");

export default function Page() {
  return <BeingBuilt href="/digital-performance" />;
}
