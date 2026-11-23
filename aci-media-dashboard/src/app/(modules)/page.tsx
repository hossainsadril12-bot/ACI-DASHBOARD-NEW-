import { BeingBuilt, beingBuiltMetadata } from "@/components/shell/being-built";

export const metadata = beingBuiltMetadata("/");

export default function Page() {
  return <BeingBuilt href="/" />;
}
