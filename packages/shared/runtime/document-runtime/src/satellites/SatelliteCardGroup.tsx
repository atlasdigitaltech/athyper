/**
 * @athyper/document-runtime — Satellite Card Group
 *
 * Spec v1.2 §C.4: Renders grouped domain-concern cards in the overview tab.
 * Each group has a heading label and a responsive grid of satellite cards.
 * Cards show: icon + title + severity badge + summary lines + expand action.
 */
"use client";

import {
  Clock,
  FileText,
  CheckCircle2,
  CreditCard,
  Calculator,
  BarChart3,
  Shield,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { Card, CardContent } from "@athyper/ui/primitives";
import { type SatelliteGroup, type SatelliteCard } from "@athyper/api-contracts/documents";

export interface SatelliteCardGroupProps {
  groups: SatelliteGroup[];
  onCardClick?: (card: SatelliteCard) => void;
  className?: string;
}

const ICON_MAP: Record<string, LucideIcon> = {
  clock: Clock,
  document: FileText,
  check_circle: CheckCircle2,
  credit_card: CreditCard,
  calculator: Calculator,
  chart_bar: BarChart3,
  shield: Shield,
  receipt_tax: Calculator,
};

function getIcon(key: string | null): LucideIcon {
  return (key && ICON_MAP[key]) || FileText;
}

function SatelliteCardItem({
  card,
  onClick,
}: {
  card: SatelliteCard;
  onClick?: () => void;
}) {
  const intent = card.intent as SemanticIntent;
  const colors = resolveSemanticColors(intent);
  const Icon = getIcon(card.icon_key);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-sm",
        onClick && "group",
      )}
      onClick={onClick}
    >
      <CardContent className="pt-5">
        {/* Header: icon + title + severity badge */}
        <div className="mb-3 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <h4 className="text-sm font-semibold">{card.title}</h4>
          </div>
          <span
            role="status"
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-medium",
              colors.subtleBadge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            <span className="capitalize">
              {card.subtitle ?? card.intent}
            </span>
          </span>
        </div>

        {/* Summary lines */}
        <div className="mb-3 space-y-1">
          {card.summary_lines.map((line, i) => (
            <div key={i} className="text-sm text-muted-foreground">
              {line.label}: {line.value}
            </div>
          ))}
        </div>

        {/* Primary action link */}
        {card.primary_action_label && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary/80 group-hover:gap-2"
          >
            <span>{card.primary_action_label}</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}

export function SatelliteCardGroup({
  groups,
  onCardClick,
  className,
}: SatelliteCardGroupProps) {
  if (groups.length === 0) return null;

  return (
    <div className={cn("space-y-8", className)}>
      {groups.map((group) => (
        <div key={group.group_key}>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </h3>
          <div
            className={cn(
              "grid gap-4",
              group.cards.length === 1
                ? "grid-cols-1 max-w-lg"
                : group.cards.length === 2
                  ? "grid-cols-1 md:grid-cols-2"
                  : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
            )}
          >
            {group.cards.map((card) => (
              <SatelliteCardItem
                key={card.id}
                card={card}
                onClick={
                  onCardClick ? () => onCardClick(card) : undefined
                }
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
