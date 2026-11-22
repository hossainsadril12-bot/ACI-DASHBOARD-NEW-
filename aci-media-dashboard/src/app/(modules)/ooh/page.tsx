import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/ooh");

export default function Page() {
  return <BeingBuilt href="/ooh" />;
}
