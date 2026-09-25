"use client";
import type { ReactNode } from "react";
import { ChevronDownIcon } from "@athyper/platform-icons";
import { Menu, MenuContent, MenuTrigger } from "./index";
/** Shared list view menu. Hosts own view storage and eligibility. */
export function ViewSelector({
  name,
  modified,
  disabled,
  className,
  children,
}: {
  name: string;
  modified?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Menu>
      <MenuTrigger
        variant="secondary"
        className={className}
        disabled={disabled}
        aria-label="Select view"
      >
        View: {name}
        {modified ? " (modified)" : ""}
        <ChevronDownIcon size={14} />
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  );
}
