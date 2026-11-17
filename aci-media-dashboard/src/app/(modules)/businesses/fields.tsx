import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

export function HiddenTag() {
  return <Badge className="bg-gray-100 text-gray-700">Hidden</Badge>;
}

/** The one text field of an add or rename dialog. The store trims, checks length and refuses duplicates. */
export function NameField({ label, defaultValue }: { label: string; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1.5 font-medium">
      {label}
      <Input name="name" defaultValue={defaultValue} required maxLength={120} autoComplete="off" />
    </label>
  );
}
