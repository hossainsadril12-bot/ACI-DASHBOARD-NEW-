import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/billing/vendors");

export default function Page() {
  return <BeingBuilt href="/billing/vendors" />;
}
