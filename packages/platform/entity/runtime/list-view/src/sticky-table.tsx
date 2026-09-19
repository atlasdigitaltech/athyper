"use client";
import React, { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { attachStickyTableHeader } from "./sticky-table-header";

export function StickyListTable({children, sticky = true, ...props}: ComponentPropsWithoutRef<"div"> & {readonly sticky?: boolean}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => sticky && ref.current ? attachStickyTableHeader(ref.current) : undefined, [children, sticky]);
  return <div {...props} ref={ref} className={`a-entity-list__table-wrap${sticky ? " a-entity-list__table-wrap--sticky-heading" : ""}`}>{children}</div>;
}
