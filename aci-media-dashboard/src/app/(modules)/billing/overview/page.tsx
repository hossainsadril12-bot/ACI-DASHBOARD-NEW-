import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/billing/overview");

export default function Page() {
  return <BeingBuilt href="/billing/overview" />;
}
