"use client";
import { createContext } from "react";

/** Hidden tabs retain editing state but must not keep document viewers/leases alive. */
export const CollaborationVisibilityContext = createContext(true);

export const CollaborationPresentationContext = createContext<"pinned" | "drawer" | "content">("pinned");

/** Register the comments toolbar without moving or remounting its editing tree. */
export const CollaborationToolbarContext = createContext<(node: HTMLDivElement | null) => void>(() => {});
