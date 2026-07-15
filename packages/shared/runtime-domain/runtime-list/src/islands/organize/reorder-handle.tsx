"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, GripVertical, X } from "lucide-react";

interface ReorderHandleProps {
  label:          string;
  disabled?:      boolean;
  active?:        boolean;
  canMoveUp:      boolean;
  canMoveDown:    boolean;
  onDragStart:    (event: React.PointerEvent<HTMLButtonElement>) => void;
  onMoveUp:       () => void;
  onMoveDown:     () => void;
  onMobileToggle: () => void;
}

interface ReorderActionsBarProps {
  label:       string;
  canMoveUp:   boolean;
  canMoveDown: boolean;
  onMoveTop:   () => void;
  onMoveUp:    () => void;
  onMoveDown:  () => void;
  onMoveBottom:() => void;
  onClose:     () => void;
}

export function ReorderHandle({
  label,
  disabled = false,
  active = false,
  canMoveUp,
  canMoveDown,
  onDragStart,
  onMoveUp,
  onMoveDown,
  onMobileToggle,
}: ReorderHandleProps) {
  const mobileReorder = useMobileReorder();

  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`${mobileReorder ? "Move" : "Reorder"} ${label}`}
      aria-expanded={mobileReorder ? active : undefined}
      title={`${mobileReorder ? "Move" : "Reorder"} ${label}`}
      onPointerDown={(event) => {
        if (!mobileReorder) onDragStart(event);
      }}
      onClick={() => {
        if (mobileReorder) onMobileToggle();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          if (canMoveUp) onMoveUp();
        }
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (canMoveDown) onMoveDown();
        }
      }}
      className={`inline-flex h-8 w-8 shrink-0 touch-none items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "bg-muted text-foreground" : ""
      }`}
    >
      <GripVertical aria-hidden="true" className="size-4" />
    </button>
  );
}

export function ReorderActionsBar({
  label,
  canMoveUp,
  canMoveDown,
  onMoveTop,
  onMoveUp,
  onMoveDown,
  onMoveBottom,
  onClose,
}: ReorderActionsBarProps) {
  return (
    <div className="border-t bg-muted/30 px-3 py-2">
      <div className="flex items-center gap-1 rounded-md border bg-background p-1 shadow-sm">
        <span className="min-w-0 flex-1 truncate px-2 text-xs font-medium text-muted-foreground">
          Move {label}
        </span>
        <ReorderActionButton
          label="Move to top"
          disabled={!canMoveUp}
          onClick={onMoveTop}
          icon={<ChevronsUp aria-hidden="true" className="size-3.5" />}
        />
        <ReorderActionButton
          label="Move up"
          disabled={!canMoveUp}
          onClick={onMoveUp}
          icon={<ArrowUp aria-hidden="true" className="size-3.5" />}
        />
        <ReorderActionButton
          label="Move down"
          disabled={!canMoveDown}
          onClick={onMoveDown}
          icon={<ArrowDown aria-hidden="true" className="size-3.5" />}
        />
        <ReorderActionButton
          label="Move to bottom"
          disabled={!canMoveDown}
          onClick={onMoveBottom}
          icon={<ChevronsDown aria-hidden="true" className="size-3.5" />}
        />
        <button
          type="button"
          aria-label={`Close move actions for ${label}`}
          onClick={onClose}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function ReorderActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label:    string;
  icon:     React.ReactNode;
  disabled: boolean;
  onClick:  () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:text-muted-foreground/35 disabled:hover:bg-transparent"
    >
      {icon}
    </button>
  );
}

function useMobileReorder(): boolean {
  const [mobile, setMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(pointer: coarse), (max-width: 767px)").matches;
  });

  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return mobile;
}
