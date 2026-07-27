"use client";

import { Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import { useOptionalAtlas } from "../provider/atlas-context";

export function AskAtlasPill({
  copilotLabel,
  className,
  onOpen,
  style,
}: {
  copilotLabel?: string;
  className?: string;
  onOpen?: () => void;
  style?: CSSProperties;
}) {
  const atlas = useOptionalAtlas();
  return (
    <button
      type="button"
      onClick={onOpen ?? atlas?.open}
      aria-label="Open Ask Atlas"
      className={className}
      style={style}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" aria-hidden />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
      </span>
      <Sparkles className="atlas-spark h-3.5 w-3.5 text-primary" aria-hidden />
      <span className="atlas-shimmer">Ask Atlas</span>
      {copilotLabel ? <span className="text-muted-foreground/80">· {copilotLabel}</span> : null}
    </button>
  );
}
