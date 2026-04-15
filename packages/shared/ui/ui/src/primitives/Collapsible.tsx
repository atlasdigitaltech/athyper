"use client";

import React, { createContext, useContext, useState, cloneElement, isValidElement, type ReactNode, type HTMLAttributes, type MouseEvent } from "react";

interface CollapsibleCtx {
  open: boolean;
  toggle: () => void;
}

const CollapsibleContext = createContext<CollapsibleCtx>({ open: false, toggle: () => {} });

interface CollapsibleProps extends HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function Collapsible({ open: controlledOpen, defaultOpen = false, onOpenChange, children, ...props }: CollapsibleProps) {
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
      <div {...props}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({ children, asChild, ...props }: HTMLAttributes<HTMLButtonElement> & { children?: ReactNode; asChild?: boolean }) {
  const { toggle } = useContext(CollapsibleContext);
  if (asChild && isValidElement(children)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const child = children as React.ReactElement<any>;
    return cloneElement(child, {
      onClick: (e: MouseEvent) => {
        toggle();
        child.props.onClick?.(e);
      },
    });
  }
  return (
    <button type="button" onClick={toggle} {...props}>
      {children}
    </button>
  );
}

function CollapsibleContent({ children, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  const { open } = useContext(CollapsibleContext);
  if (!open) return null;
  return <div {...props}>{children}</div>;
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
