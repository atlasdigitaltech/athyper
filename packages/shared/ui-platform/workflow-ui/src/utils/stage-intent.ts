import { type SemanticIntent } from "@athyper/platform-theme/semantic-colors";

const STATUS_INTENT_MAP: Record<string, SemanticIntent> = {
  completed: "success",
  rejected:  "error",
  active:    "info",
  skipped:   "neutral",
  pending:   "muted",
};

export function stageIntentFromStatus(status: string): SemanticIntent {
  return STATUS_INTENT_MAP[status] ?? "muted";
}
