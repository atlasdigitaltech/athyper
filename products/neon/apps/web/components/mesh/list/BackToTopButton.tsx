"use client";

// components/mesh/list/BackToTopButton.tsx
//
// Floating "back to top" button that appears after scrolling past a threshold.
// Only renders in infinite scroll mode. Uses absolute positioning within
// the content area (not fixed to viewport) so it stays inside the layout
// bounds on tablet/mobile views with sidebars.

import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

import { useListPage } from "./ListPageContext";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SHOW_THRESHOLD = 400; // px scrolled before showing

export function BackToTopButton() {
  const { infiniteScroll, scrollContainerRef } = useListPage();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!infiniteScroll || infiniteScroll.scrollMode !== "infinite") return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setVisible(container.scrollTop > SHOW_THRESHOLD);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [infiniteScroll, scrollContainerRef]);

  if (!infiniteScroll || infiniteScroll.scrollMode !== "infinite") return null;

  return (
    <Button
      variant="secondary"
      size="icon"
      className={cn(
        "absolute bottom-16 right-3 z-40 size-10 rounded-full shadow-lg transition-all duration-200",
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-4 pointer-events-none",
      )}
      onClick={infiniteScroll.scrollToTop}
      aria-label="Scroll to top"
    >
      <ArrowUp className="size-4" />
    </Button>
  );
}
