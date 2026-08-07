/**
 * @athyper/icons — Status Icon Registry
 *
 * Maps semantic intents to Lucide icons.
 * Pairs with @athyper/platform-theme/semantic-colors which provides the color classes.
 *
 * Usage:
 *   import { getStatusIcon } from "@athyper/icons/statuses";
 *   import { resolveSemanticColors } from "@athyper/platform-theme/semantic-colors";
 *   import { cn } from "@athyper/platform-theme/utils";
 *
 *   const Icon = getStatusIcon("success");
 *   const colors = resolveSemanticColors("success");
 *   <Icon size={12} className={cn("shrink-0", colors.text)} />
 *
 * These are the 8 GENERIC semantic intents — not business-specific statuses.
 * Business status → intent mapping lives in packages/metadata-client.
 */
import {
  Circle,
  Info,
  CircleCheck,
  TriangleAlert,
  CircleX,
  Star,
  Sparkles,
  Minus,
  CircleHelp,
  type LucideIcon,
} from "lucide-react";

import { type SemanticIntent } from "@athyper/platform-theme/semantic-colors";

const STATUS_ICON_MAP: Record<SemanticIntent, LucideIcon> = {
  neutral: Circle,
  info:    Info,
  success: CircleCheck,
  warning: TriangleAlert,
  error:   CircleX,
  primary: Star,
  accent:  Sparkles,
  muted:   Minus,
};

/** Fallback icon for unknown intent values (runtime safety). */
const FALLBACK_ICON: LucideIcon = CircleHelp;

/**
 * Get the icon for a semantic intent.
 *
 * @param intent - e.g. "success", "warning", "error"
 * @returns Lucide icon component — never undefined, falls back to CircleHelp
 */
export function getStatusIcon(intent: SemanticIntent): LucideIcon {
  return STATUS_ICON_MAP[intent] ?? FALLBACK_ICON;
}
