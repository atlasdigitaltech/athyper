/**
 * @athyper/document-runtime — Process Health Strip
 *
 * Spec v1.2 §4.1 / Appendix C: Horizontal ribbon of process health tiles.
 * Each tile represents a process dimension (approval, matching, budget, etc.)
 * with a severity indicator, label, and summary text.
 *
 * Tiles are clickable and emit a satelliteIntent for local navigation.
 * Responsive: grid on desktop, horizontal scroll on mobile.
 */
"use client";

import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  MinusCircle,
  ArrowRight,
  PauseCircle,
  Sparkles,
} from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { type ProcessHealthTile } from "@athyper/api-contracts/documents";

export interface ProcessHealthStripProps {
  tiles: ProcessHealthTile[];
  onTileClick?: (tile: ProcessHealthTile) => void;
  className?: string;
}

const SEVERITY_ICON: Record<SemanticIntent, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
  neutral: MinusCircle,
  primary: ArrowRight,
  muted: PauseCircle,
  accent: Sparkles,
};

export function ProcessHealthStrip({
  tiles,
  onTileClick,
  className,
}: ProcessHealthStripProps) {
  if (tiles.length === 0) return null;

  return (
    <div className={cn("rounded-lg border bg-card/80 p-3", className)}>
      <div className="flex gap-3 overflow-x-auto md:grid md:grid-cols-7 md:overflow-visible">
        {tiles.map((tile) => {
          const intent = tile.severity as SemanticIntent;
          const colors = resolveSemanticColors(intent);
          const Icon = SEVERITY_ICON[intent] ?? MinusCircle;

          return (
            <button
              key={tile.dimension}
              type="button"
              onClick={() => onTileClick?.(tile)}
              className={cn(
                "flex min-w-[140px] shrink-0 flex-col rounded-md border p-3 text-left transition-all",
                "hover:shadow-sm md:min-w-0",
                colors.subtleBadge,
              )}
              aria-label={`${tile.label}: ${tile.summary ?? ""}`}
            >
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium">{tile.label}</span>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {tile.summary && (
                <span className="text-xs leading-relaxed opacity-80">
                  {tile.summary}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
