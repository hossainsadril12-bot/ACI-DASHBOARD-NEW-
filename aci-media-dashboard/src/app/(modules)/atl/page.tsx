import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/atl");

export default function Page() {
  return <BeingBuilt href="/atl" />;
}
