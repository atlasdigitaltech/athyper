"use client";

/**
 * IntentBadge — pill that renders a comment's semantic role
 * (document.comment_intent).
 *
 * The label, icon and tone all come from the lookup domain — nothing here
 * hardcodes intent codes. `general` is treated as the "no badge" baseline.
 *
 * Tone is mapped to semantic Tailwind tokens. New intents added in SQL
 * pick up automatically; unrecognised tones fall back to muted.
 */

import {
  Check,
  CheckCircle2,
  Cpu,
  HelpCircle,
  MessageCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@athyper/platform-theme/utils";
import { useCommentIntents } from "../hooks/collab";

export interface IntentBadgeProps {
  intent: string | undefined;
  className?: string;
}

// Tone → Tailwind class set (semantic tokens only — no raw colors)
const TONE_CLASSES: Record<string, string> = {
  success: "border-success/30 bg-success/10 text-success",
  info:    "border-primary/30 bg-primary/10 text-primary",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger:  "border-destructive/30 bg-destructive/10 text-destructive",
  muted:   "border-border/60 bg-muted text-muted-foreground",
};

// Icon-name → component. The list is open: new icon names added in
// lookup_value.metadata will fall back to MessageSquare if not registered here.
const ICON_BY_NAME: Record<string, LucideIcon> = {
  message_square: MessageSquare,
  send:           Send,
  check_circle:   CheckCircle2,
  check:          Check,
  x_circle:       XCircle,
  help_circle:    HelpCircle,
  message_circle: MessageCircle,
  shield_check:   ShieldCheck,
  cpu:            Cpu,
};

export function IntentBadge({ intent, className }: IntentBadgeProps) {
  const { intents } = useCommentIntents();
  if (!intent || intent === "general") return null;

  const option = intents.find((i) => i.code === intent);
  if (!option) return null;

  const meta     = option.metadata ?? {};
  const toneKey  = typeof meta["tone"] === "string" ? (meta["tone"] as string) : "muted";
  const toneCls  = TONE_CLASSES[toneKey] ?? TONE_CLASSES["muted"]!;
  const iconKey  = typeof meta["icon"] === "string" ? (meta["icon"] as string) : "message_square";
  const Icon     = ICON_BY_NAME[iconKey] ?? MessageSquare;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs font-medium leading-none",
        toneCls,
        className,
      )}
      title={option.description ?? option.name}
    >
      <Icon className="size-2.5" />
      {option.name}
    </span>
  );
}
