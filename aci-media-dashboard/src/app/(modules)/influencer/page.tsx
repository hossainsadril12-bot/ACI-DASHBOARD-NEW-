import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/influencer");

export default function Page() {
  return <BeingBuilt href="/influencer" />;
}
