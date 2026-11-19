"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { FilePreview } from "@/server/ingest";
import { CardFace } from "./card-face";
import { startDraft, type CardState } from "./cards-state";
import { FileBlock, SkeletonBlock } from "./file-block";
import { afterPreview, canPublishAll, postUploads, publishedMessage, takeFiles, takeThenReset, toDecisions, uploadForm, type BusinessOption, type RowDraft } from "./logic";

/** The files left out of a pick or a drop, and why. */
function LeftOut({ notes }: { notes: string[] }) {
  return <ul className="w-full min-w-0 space-y-0.5 text-sm break-words text-amber-800">{notes.map((n) => <li key={n}>{n}</li>)}</ul>;
}

/**
 * One Upload Data card for the admin: Upload Excel or a drop opens "Check before publishing", which previews the
 * files as this card's type, asks the Part C questions, and publishes. The server checks every file again.
 */
export function DataCard({ state, businesses, pickBusinesses }: {
  state: CardState; businesses: BusinessOption[];
  /** The businesses offered for a file's own business (the Digital card for another business); default: businesses. */
  pickBusinesses?: BusinessOption[];
}) {
  const { card } = state;
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef(0); // only the newest preview request may update the blocks
  const sent = useRef(""); // the decisions the blocks on screen were previewed with
  const nextId = useRef(0);
  const [ids, setIds] = useState<number[]>([]); // a stable React key per file, so a block's open panels follow it
  const [files, setFiles] = useState<File[]>([]);
  const [drafts, setDrafts] = useState<RowDraft[]>([]);
  const [previews, setPreviews] = useState<FilePreview[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = checking || publishing;

  const decisionsOf = (ds: RowDraft[]) => ds.map((d) => toDecisions(d, businesses));
  /** Every file goes as this card's type: the card decides the type, and the server checks the file is one. */
  const typesOf = (list: File[]) => list.map(() => card.type);

  /** Previews every current file again, so batch rules (two files for one dataset) stay right. */
  async function check(nextFiles: File[], nextDrafts: RowDraft[], keepBlocks: boolean) {
    const id = ++latest.current;
    const decisions = decisionsOf(nextDrafts);
    sent.current = JSON.stringify(decisions);
    setFiles(nextFiles);
    setDrafts(nextDrafts);
    setError(null);
    if (!keepBlocks) setPreviews(null);
    if (nextFiles.length === 0) return setChecking(false);
    setChecking(true);
    const res = await postUploads<{ previews: FilePreview[] }>("/api/uploads/preview", uploadForm(nextFiles, typesOf(nextFiles), decisions));
    if (id !== latest.current) return;
    setChecking(false);
    if (res.error) {
      sent.current = ""; // nothing was previewed: the same decisions can be sent again
      setError(res.error);
      setPreviews(null);
      return;
    }
    const list = res.previews ?? [];
    setPreviews(list);
    // Names the server no longer asks about (decided) stay on screen so the admin can change them.
    setDrafts(nextDrafts.map((d, i) => (list[i] ? afterPreview(d, list[i]) : d)));
  }

  /** Keeps a file's draft; previews again when what would be sent changed. */
  function apply(next: RowDraft[]) {
    if (JSON.stringify(decisionsOf(next)) !== sent.current) void check(files, next, true);
    else setDrafts(next);
  }
  const setDraft = (i: number, d: RowDraft) => apply(drafts.map((x, j) => (j === i ? d : x)));
  const typeDraft = (i: number, d: RowDraft) => setDrafts(drafts.map((x, j) => (j === i ? d : x))); // typing: sent on blur

  function add(list: FileList | null) {
    const chosen = takeThenReset(list, () => { if (inputRef.current) inputRef.current.value = ""; });
    const { taken, leftOut: notes } = takeFiles(chosen, card.multiple);
    setLeftOut(notes); // shown in the dialog; on the card only when no file was taken (no dialog)
    if (taken.length === 0) return;
    setIds(taken.map(() => ++nextId.current));
    void check(taken, taken.map(() => startDraft(state)), false);
  }

  function clear() {
    latest.current++;
    sent.current = "";
    setIds([]);
    setFiles([]);
    setDrafts([]);
    setPreviews(null);
    setChecking(false);
    setError(null);
    setLeftOut([]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(i: number) {
    if (files.length === 1) return clear();
    const keep = (_: unknown, j: number) => j !== i;
    setIds(ids.filter(keep));
    void check(files.filter(keep), drafts.filter(keep), false);
  }

  async function publish() {
    setPublishing(true);
    setError(null);
    const res = await postUploads<{ published: { datasetKey: string; label: string; versionId: number }[] }>(
      "/api/uploads/publish", uploadForm(files, typesOf(files), decisionsOf(drafts)),
    );
    setPublishing(false);
    if (res.error) {
      // Refused (for example the data changed while uploading): show why, and preview again so the blocks match the server.
      await check(files, drafts, true);
      return setError(res.error);
    }
    toast.success(publishedMessage(res.published ?? []));
    clear();
    router.refresh(); // the cards' In use lines
  }

  const blocksReady = previews !== null && previews.length === files.length;
  const canPublish = canPublishAll(previews, files.length) && !busy;

  return (
    <>
      <CardFace state={state} dragging={dragging}
        onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) add(e.dataTransfer.files); }}>
        <Button variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
          <Upload aria-hidden />
          Upload Excel
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx" multiple={card.multiple} tabIndex={-1} className="sr-only"
          aria-label={`Choose Excel ${card.multiple ? "files" : "file"} for ${state.title}`}
          onChange={(e) => add(e.target.files)} />
        {leftOut.length > 0 && files.length === 0 && <LeftOut notes={leftOut} />}
      </CardFace>
      <Dialog open={files.length > 0} onOpenChange={(open) => { if (!open && !publishing) clear(); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" showCloseButton={!publishing}>
          <DialogHeader>
            <DialogTitle className="pr-8 break-words">Check before publishing · {state.title}</DialogTitle>
          </DialogHeader>
          {leftOut.length > 0 && <LeftOut notes={leftOut} />}
          {checking && <span role="status" className="sr-only">Reading the files…</span>}
          <ul className={cn("min-w-0 divide-y divide-gray-200 rounded-xl border border-gray-200", checking && blocksReady && "opacity-60")} aria-busy={checking}>
            {files.map((f, i) => {
              const p = blocksReady && previews ? previews[i] : null;
              const key = ids[i] ?? `f${i}`;
              if (checking && !p) return <SkeletonBlock key={key} name={f.name} />;
              return (
                <FileBlock key={key} name={f.name} cardType={card.type} fixedBusiness={state.business !== null} preview={p}
                  draft={drafts[i] ?? startDraft(state)} businesses={businesses} pickBusinesses={pickBusinesses} disabled={busy}
                  onDraft={(d) => setDraft(i, d)}
                  onTyping={(d) => typeDraft(i, d)}
                  onCommit={() => apply(drafts)}
                  onRemove={card.multiple ? () => remove(i) : null} />
              );
            })}
          </ul>
          {error && <p role="alert" className="text-sm break-words text-red-700">{error}</p>}
          <DialogFooter className="flex-wrap">
            <Button variant="outline" onClick={clear} disabled={publishing}>Cancel</Button>
            <Button onClick={() => void publish()} disabled={!canPublish}>{publishing ? "Publishing…" : "Publish"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
