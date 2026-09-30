"use client";
import React, { type ReactNode } from "react";
import { ChevronDownIcon } from "@athyper/platform-icons";
import { Menu, MenuContent, MenuTrigger } from "./index";
import { useUiMessages } from "./ui-messages";
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
  const messages = useUiMessages();
  return (
    <Menu>
      <MenuTrigger
        variant="secondary"
        className={className}
        disabled={disabled}
        aria-label={messages.selectView}
      >
        {messages.viewName(name, Boolean(modified))}
        <ChevronDownIcon size={14} />
      </MenuTrigger>
      <MenuContent>{children}</MenuContent>
    </Menu>
  );
}
