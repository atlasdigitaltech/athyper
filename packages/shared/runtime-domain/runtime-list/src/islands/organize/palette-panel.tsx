"use client";

import { useEffect, useRef, useState } from "react";
import type React from "react";
import { GripHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@athyper/platform-ui";

interface PalettePanelProps {
  trigger:    React.ReactElement;
  title:      string;
  width?:     number;
  open:       boolean;
  onOpenChange: (open: boolean) => void;
  children:   React.ReactNode;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
}

/** Anchored organize surface backed by the shared Radix Popover primitive. */
export function PalettePanel({
  trigger,
  title,
  width = 360,
  open,
  onOpenChange,
  children,
}: PalettePanelProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    if (!open) {
      setOffset({ x: 0, y: 0 });
      dragRef.current = null;
      setDragging(false);
    }
  }, [open]);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button,a,input,select,textarea,[role='button']")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: drag.offsetX + event.clientX - drag.startX,
      y: drag.offsetY + event.clientY - drag.startY,
    });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        aria-label={title}
        side="bottom"
        align="end"
        className="flex min-h-0 max-h-[calc(100dvh-1rem)] flex-col p-0"
        style={{
          width,
          maxHeight: "min(34rem, var(--radix-popover-content-available-height, calc(100dvh - 1rem)))",
          translate: `${offset.x}px ${offset.y}px`,
        }}
        onPointerDownOutside={() => onOpenChange(false)}
      >
        <div
          className={`flex h-12 shrink-0 items-center justify-between border-b px-4 ${dragging ? "cursor-grabbing select-none" : "cursor-grab"}`}
          onPointerDown={startDrag}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
            <GripHorizontal aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{title}</span>
          </h2>
        </div>
        <div
          data-runtime-palette-scroll
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
        >
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
