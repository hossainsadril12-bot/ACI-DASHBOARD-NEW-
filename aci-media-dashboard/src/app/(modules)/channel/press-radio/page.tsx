import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/channel/press-radio");

export default function Page() {
  return <BeingBuilt href="/channel/press-radio" />;
}
