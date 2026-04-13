/**
 * @athyper/document-runtime — Status Lanes
 *
 * Rec 4: Five parallel status chips below the header.
 * Document | Workflow | Fulfilment | Accounting | Settlement
 */
import { cn } from "@athyper/theme/utils";
import { type SemanticIntent, resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { type StatusLane } from "@athyper/api-contracts/documents";

export interface StatusLanesProps {
  lanes: StatusLane[];
  onLaneClick?: (lane: StatusLane) => void;
  className?: string;
}

export function StatusLanes({ lanes, onLaneClick, className }: StatusLanesProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {lanes.map((lane) => {
        const colors = resolveSemanticColors(lane.intent as SemanticIntent);
        return (
          <button
            key={lane.lane}
            onClick={() => onLaneClick?.(lane)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors",
              "hover:bg-accent/50",
              colors.border,
            )}
            title={`${lane.label}: ${lane.status_label}`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
            <span className="font-medium text-muted-foreground">{lane.label}:</span>
            <span className="font-semibold">{lane.status_label}</span>
            {lane.summary && (
              <span className="text-muted-foreground">({lane.summary})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
