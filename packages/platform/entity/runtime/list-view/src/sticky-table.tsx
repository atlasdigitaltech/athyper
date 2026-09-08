"use client";
import React, { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { attachStickyTableHeader } from "./sticky-table-header";

export function StickyListTable({children, ...props}: ComponentPropsWithoutRef<"div">) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current ? attachStickyTableHeader(ref.current) : undefined, [children]);
  return <div {...props} ref={ref} className="a-entity-list__table-wrap a-entity-list__table-wrap--sticky-heading">{children}</div>;
}
