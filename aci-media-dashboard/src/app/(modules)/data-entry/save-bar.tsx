import { Button } from "@/components/ui/button";

/** The editor's bottom bar: the status, Discard changes and Save & publish (admin only). Errors show in red. */
export function SaveBar({ dirty, pending, error, onDiscard, onSave }: {
  dirty: boolean; pending: boolean; error: string | null; onDiscard: () => void; onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
      <div className="min-w-0">
        <p className="text-sm text-gray-700" aria-live="polite">{dirty ? "Unsaved changes" : "All saved"}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" disabled={!dirty || pending} onClick={onDiscard}>Discard changes</Button>
        <Button type="button" disabled={!dirty || pending} onClick={onSave}>{pending ? "Saving…" : "Save & publish"}</Button>
      </div>
    </div>
  );
}
