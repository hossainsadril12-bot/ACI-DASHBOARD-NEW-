import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/billing/ooh");

export default function Page() {
  return <BeingBuilt href="/billing/ooh" />;
}
