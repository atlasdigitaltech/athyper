"use client";

/**
 * ActionMenu — ellipsis-triggered dropdown for per-row or per-card actions.
 *
 * Renders a ⋯ icon button by default; pass `trigger` to use a custom element.
 * Items can be destructive (red tint) or separated by a divider via `separator`.
 *
 * Usage:
 *   <ActionMenu
 *     items={[
 *       { key: "edit",   label: "Edit",   icon: <Pencil />, onClick: handleEdit },
 *       { key: "delete", label: "Delete", icon: <Trash2 />, onClick: handleDelete, destructive: true, separator: true },
 *     ]}
 *   />
 */

import { type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  /** Renders in destructive colour (delete, void, etc.). */
  destructive?: boolean;
  /** Draws a separator line above this item. */
  separator?: boolean;
}

export interface ActionMenuProps {
  items: ActionMenuItem[];
  /** Custom trigger element. Defaults to a ⋯ icon button. */
  trigger?: ReactNode;
  align?: "start" | "center" | "end";
  disabled?: boolean;
  className?: string;
}

export function ActionMenu({
  items,
  trigger,
  align = "end",
  disabled,
  className,
}: ActionMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild disabled={disabled}>
        {trigger ?? (
          <button
            type="button"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground",
              "hover:bg-accent hover:text-accent-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50",
              className,
            )}
            aria-label="Actions"
          >
            <MoreHorizontal className="size-4" />
          </button>
        )}
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={4}
          className="z-popover min-w-[10rem] overflow-hidden rounded-md border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {items.map((item) => (
            <span key={item.key}>
              {item.separator && (
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
              )}
              <DropdownMenu.Item
                disabled={item.disabled}
                onSelect={item.onClick}
                className={cn(
                  "flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none",
                  "focus:bg-accent focus:text-accent-foreground",
                  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  item.destructive &&
                    "text-destructive focus:bg-destructive/10 focus:text-destructive",
                )}
              >
                {item.icon && (
                  <span className="size-4 shrink-0 [&>svg]:size-4">{item.icon}</span>
                )}
                {item.label}
              </DropdownMenu.Item>
            </span>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
