import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/fy-spend");

export default function Page() {
  return <BeingBuilt href="/fy-spend" />;
}
