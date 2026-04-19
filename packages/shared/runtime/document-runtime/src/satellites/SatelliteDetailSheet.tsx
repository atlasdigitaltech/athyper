/**
 * @athyper/document-runtime — Satellite Detail Sheet
 *
 * Slide-over panel for expanded satellite card data.
 * Renders the card's summary lines as a structured detail view and
 * delegates domain-specific detail_data rendering to an optional
 * renderDetail callback.
 */
"use client";

import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
} from "@athyper/ui/primitives";
import { type SatelliteCard } from "@athyper/api-contracts/documents";

export interface SatelliteDetailSheetProps {
  card: SatelliteCard | null;
  open: boolean;
  onClose: () => void;
  /** Custom renderer for the card's detail_data. Falls back to generic key-value pairs. */
  renderDetail?: (card: SatelliteCard) => ReactNode;
  className?: string;
}

function GenericDetailData({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([, v]) => v != null && typeof v !== "object",
  );

  if (entries.length === 0) return null;

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div
          key={key}
          className="rounded-md bg-muted/30 px-3 py-2 text-sm"
        >
          <span className="font-medium capitalize">
            {key.replace(/_/g, " ")}
          </span>
          : {String(value)}
        </div>
      ))}
    </div>
  );
}

export function SatelliteDetailSheet({
  card,
  open,
  onClose,
  renderDetail,
  className,
}: SatelliteDetailSheetProps) {
  if (!card) return null;

  const intent = card.intent as SemanticIntent;
  const colors = resolveSemanticColors(intent);

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className={cn("w-full sm:max-w-lg", className)}>
        <SheetHeader>
          <div className="flex items-center justify-between">
            <SheetTitle>{card.title}</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Status */}
          <div>
            <div className="mb-2 text-sm text-muted-foreground">Status</div>
            <span
              role="status"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
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
          <div>
            <div className="mb-2 text-sm text-muted-foreground">Details</div>
            <div className="space-y-2">
              {card.summary_lines.map((line, i) => (
                <div
                  key={i}
                  className="rounded-md bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{line.label}</span>: {line.value}
                </div>
              ))}
            </div>
          </div>

          {/* Document reference */}
          {card.document_ref && (
            <div>
              <div className="mb-2 text-sm text-muted-foreground">
                Document Reference
              </div>
              <div className="rounded-md bg-muted px-3 py-2 font-mono text-sm">
                {card.document_ref}
              </div>
            </div>
          )}

          {/* Detail data */}
          {card.detail_data && (
            <div>
              {renderDetail ? (
                renderDetail(card)
              ) : (
                <>
                  <div className="mb-2 text-sm text-muted-foreground">
                    Additional Data
                  </div>
                  <GenericDetailData
                    data={card.detail_data as Record<string, unknown>}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
