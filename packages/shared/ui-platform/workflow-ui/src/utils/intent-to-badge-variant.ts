import { type SemanticIntent } from "@athyper/platform-theme/semantic-colors";

// Mirrors the variant union from @athyper/ui Badge without importing the component type
type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "destructive" | "info" | "muted";

const INTENT_VARIANT_MAP: Partial<Record<SemanticIntent, BadgeVariant>> = {
  success: "success",
  error:   "destructive",
  warning: "warning",
  info:    "info",
  muted:   "muted",
  neutral: "muted",
};

export function intentToBadgeVariant(intent: SemanticIntent): BadgeVariant {
  return INTENT_VARIANT_MAP[intent] ?? "outline";
}
