"use client";

import { Badge } from "@/components/ui/badge";
import { CLASS_BADGE } from "@/lib/semantic-colors";
import { cn } from "@/lib/utils";

const CLASS_LABELS: Record<string, string> = {
  REFERENCE: "Reference",
  MASTER: "Master",
  DOCUMENT: "Document",
  CONTROL: "Control",
  LEDGER: "Ledger",
  LOG: "Log",
};

interface ClassBadgeProps {
  entityClass: string;
  className?: string;
}

export function ClassBadge({ entityClass, className }: ClassBadgeProps) {
  const style = CLASS_BADGE[entityClass] ?? "";
  const label = CLASS_LABELS[entityClass] ?? entityClass;
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-normal", style, className)}
    >
      {label}
    </Badge>
  );
}
