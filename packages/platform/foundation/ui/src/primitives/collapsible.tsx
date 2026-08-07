"use client";

import { createContext, useContext, useState, type ReactNode, type HTMLAttributes } from "react";
import { Slot } from "@radix-ui/react-slot";

interface CollapsibleCtx {
  open: boolean;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleCtx | null>(null);

function useCollapsible(): CollapsibleCtx {
  const ctx = useContext(CollapsibleContext);
  if (!ctx) throw new Error("CollapsibleTrigger/CollapsibleContent must be used inside <Collapsible>");
  return ctx;
}

interface CollapsibleProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function Collapsible({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: CollapsibleProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const toggle = () => {
    const next = !open;
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <CollapsibleContext.Provider value={{ open, toggle }}>
      <div data-state={open ? "open" : "closed"} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  children,
  asChild = false,
  ...props
}: HTMLAttributes<HTMLButtonElement> & { children?: ReactNode; asChild?: boolean }) {
  const { open, toggle } = useCollapsible();

  if (asChild) {
    return (
      <Slot
        onClick={toggle}
        aria-expanded={open}
        {...(props as HTMLAttributes<HTMLElement>)}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button type="button" onClick={toggle} aria-expanded={open} {...props}>
      {children}
    </button>
  );
}

function CollapsibleContent({
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  const { open } = useCollapsible();
  if (!open) return null;
  return (
    <div data-state="open" {...props}>
      {children}
    </div>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
