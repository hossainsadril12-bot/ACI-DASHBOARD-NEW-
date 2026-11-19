import type { DragEventHandler, ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CardState } from "./cards-state";

type Drop = {
  dragging?: boolean;
  onDragOver?: DragEventHandler<HTMLDivElement>;
  onDragLeave?: DragEventHandler<HTMLDivElement>;
  onDrop?: DragEventHandler<HTMLDivElement>;
};

/**
 * One Upload Data card (spec 3.2): the title, the file it expects, the pages it updates and what it shows now.
 * No hooks: the server page renders it as is for a viewer, and DataCard adds the admin's button and drop.
 */
export function CardFace({ state, dragging = false, onDragOver, onDragLeave, onDrop, children }: Drop & { state: CardState; children?: ReactNode }) {
  return (
    <Card data-testid="upload-card" data-card-id={state.id} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      className={cn("min-w-0 transition-colors", dragging && "border-primary bg-accent")}>
      <CardContent className="flex h-full flex-col gap-3">
        <div className="min-w-0 space-y-1">
          <h2 className="font-semibold text-gray-900 [overflow-wrap:anywhere]">{state.title}</h2>
          <p className="text-gray-500">{state.card.fileText}</p>
        </div>
        <dl className="space-y-1">
          <div>
            <dt className="inline text-gray-500">{"Updates: "}</dt>
            <dd className="inline text-gray-900">{state.card.updates}</dd>
          </div>
          <div>
            <dt className="inline text-gray-500">{"Now showing: "}</dt>
            <dd className="inline text-gray-900 [overflow-wrap:anywhere]">{state.nowShowing}</dd>
          </div>
        </dl>
        {children && <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">{children}</div>}
      </CardContent>
    </Card>
  );
}
