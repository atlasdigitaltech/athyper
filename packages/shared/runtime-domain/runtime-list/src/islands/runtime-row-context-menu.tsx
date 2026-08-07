"use client";

import type { ComponentType, SVGProps } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@athyper/platform-ui";

export interface RuntimeRowContextCopyItem {
  key: string;
  label: string;
  value: string;
}

interface RuntimeRowContextAction {
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  onSelect: () => void;
}

interface RuntimeRowContextMenuProps {
  open: boolean;
  x: number;
  y: number;
  actions: RuntimeRowContextAction[];
  copyItems?: RuntimeRowContextCopyItem[];
  copiedKey?: string | null;
  onCopy?: (item: RuntimeRowContextCopyItem) => void;
  onOpenChange: (open: boolean) => void;
}

export function RuntimeRowContextMenu({
  open,
  x,
  y,
  actions,
  copyItems = [],
  copiedKey,
  onCopy,
  onOpenChange,
}: RuntimeRowContextMenuProps) {
  if (!open) return null;

  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          aria-hidden="true"
          className="fixed size-px"
          style={{ left: x, top: y }}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={4}
        collisionPadding={8}
        className="min-w-[260px] max-w-[320px]"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {actions.map(({ label, icon: Icon, onSelect }) => (
          <DropdownMenuItem key={label} onSelect={onSelect}>
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </DropdownMenuItem>
        ))}
        {copyItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Copy field</DropdownMenuLabel>
            <div className="max-h-56 overflow-y-auto">
              {copyItems.map((item) => (
                <DropdownMenuItem
                  key={item.key}
                  onSelect={() => onCopy?.(item)}
                  className="grid grid-cols-[7.5rem_minmax(0,1fr)_1rem] items-center gap-2"
                >
                  <span className="truncate text-muted-foreground">{item.label}</span>
                  <span className="truncate font-medium text-foreground">{item.value}</span>
                  <span aria-label={copiedKey === item.key ? "Copied" : undefined}>
                    {copiedKey === item.key ? "✓" : ""}
                  </span>
                </DropdownMenuItem>
              ))}
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
