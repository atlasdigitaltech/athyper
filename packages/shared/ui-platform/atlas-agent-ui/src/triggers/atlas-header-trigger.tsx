"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@athyper/ui/primitives";
import { useOptionalAtlas } from "../provider/atlas-context";

export interface AtlasHeaderTriggerProps {
  label?: string;
  className?: string;
}

/**
 * Effective trigger: authorization details remain server-side and the control
 * exists only after the request-effective catalog contains an available mode.
 */
export function AtlasHeaderTrigger({
  label = "Open Atlas",
  className,
}: AtlasHeaderTriggerProps) {
  const atlas = useOptionalAtlas();
  if (!atlas || atlas.availability !== "ready") return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={atlas.isOpen}
      onClick={atlas.open}
      className={`h-10 gap-2 rounded-lg px-2 text-muted-foreground hover:text-foreground sm:px-3 ${className ?? ""}`}
    >
      <Sparkles className="size-5 shrink-0" aria-hidden />
      <span className="hidden text-sm font-medium xl:inline">Atlas</span>
    </Button>
  );
}
