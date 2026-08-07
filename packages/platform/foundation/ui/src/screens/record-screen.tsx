"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@athyper/platform-theme/utils";

export interface RecordScreenProps {
  /**
   * Render prop — receives pinned state so the chrome can switch between
   * expanded and compact modes without lifting state out of this component.
   *
   * @example
   * chrome={(pinned) => <RuntimeRecordChrome mode={pinned ? "pinned" : "expanded"} />}
   */
  chrome: (pinned: boolean) => ReactNode;
  children: ReactNode;
  className?: string;
  /**
   * Scroll offset (px) before the chrome pins.
   * Matches the threshold used in the original RuntimeRecordWorkspace (96).
   */
  pinThreshold?: number;
}

export function RecordScreen({
  chrome,
  children,
  className,
  pinThreshold = 96,
}: RecordScreenProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      // Functional updater avoids calling setState on every tick when the
      // boolean hasn't changed — React bails out only after entering the
      // scheduler, so this guard eliminates the scheduler entry cost entirely
      // at 60+ scroll events/sec when already pinned/unpinned.
      const next = el.scrollTop > pinThreshold;
      setPinned((prev) => (prev === next ? prev : next));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [pinThreshold]);

  return (
    // h-full (not min-h-full) is required: the inner flex-1 overflow-y-auto
    // body only creates a real scroll boundary when the flex container has a
    // fixed height. min-h-full allows unbounded growth — bodyRef.scrollTop
    // would always be 0 and pinning would never fire.
    <div className={cn("flex h-full flex-col gap-1.5 bg-muted/20", className)}>
      {chrome(pinned)}
      <div ref={bodyRef} className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
