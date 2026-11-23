import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/channel/electronic");

export default function Page() {
  return <BeingBuilt href="/channel/electronic" />;
}
