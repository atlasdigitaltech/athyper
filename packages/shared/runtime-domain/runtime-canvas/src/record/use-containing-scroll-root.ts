"use client";

import { useEffect, useRef, useState } from "react";

export function useContainingScrollRoot<TElement extends HTMLElement>() {
  const scopeRef = useRef<TElement>(null);
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null | undefined>(undefined);

  useEffect(() => {
    setScrollRoot(scopeRef.current?.closest<HTMLElement>("[data-scroll-root]") ?? null);
  }, []);

  return { scopeRef, scrollRoot };
}
