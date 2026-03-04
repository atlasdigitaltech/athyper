"use client";

import { Badge } from "@neon/ui";

import type { BadgeDescriptor } from "@/lib/entity-page/types";

// Map descriptor badge variants to actual Badge component variants.
// The Badge primitive supports: default, secondary, destructive, outline, ghost, link.
// The descriptor may emit "warning" or "success" which we map to the closest match.
const variantMap: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  default: "default",
  secondary: "secondary",
  destructive: "destructive",
  outline: "outline",
  warning: "secondary",
  success: "default",
};

interface EntityBadgeStripProps {
  badges: BadgeDescriptor[];
}

export function EntityBadgeStrip({ badges }: EntityBadgeStripProps) {
  if (badges.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      {badges.map((badge) => (
        <Badge
          key={badge.code}
          variant={variantMap[badge.variant] ?? "default"}
        >
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}
