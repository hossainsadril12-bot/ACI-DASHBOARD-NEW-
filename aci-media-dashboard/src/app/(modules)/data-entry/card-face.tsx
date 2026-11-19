import type { DragEventHandler, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { NOTHING_YET, type CardState } from "./cards-state";

type Drop = {
  dragging?: boolean;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
};

/**
 * One Upload Data card (spec 3.2): the title, one short line with the file and the pages it updates, and what is in use.
 * No hooks: the server page renders it as is for a viewer, and DataCard adds the admin's button and drop.
 */
export function CardFace({ state, dragging = false, onDragOver, onDragLeave, onDrop, children }: Drop & { state: CardState; children?: ReactNode }) {
  return (
    <Card data-testid="upload-card" data-card-id={state.id} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className={cn("min-w-0 transition-colors", dragging && "border-primary bg-accent")}>
      <CardContent className="flex h-full flex-col gap-2">
        <h2 className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{state.title}</h2>
        <p className="text-sm text-gray-600">{`${state.card.fileText} Updates ${state.card.updates}.`}</p>
        <p className="text-sm text-gray-500 [overflow-wrap:anywhere]">
          {"In use: "}
          <span className={state.nowShowing === NOTHING_YET ? undefined : "text-gray-900"}>{state.nowShowing}</span>
        </p>
        {children && <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">{children}</div>}
      </CardContent>
    </Card>
  );
}
