import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/settings/access");

export default function Page() {
  return <BeingBuilt href="/settings/access" />;
}
