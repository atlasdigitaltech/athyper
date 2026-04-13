/**
 * @athyper/workflow-ui — Status Tooltip
 *
 * Rec 16 (Phase 1): Tooltip/popover showing status meaning,
 * entered at/by, and next possible states.
 */
import { Info } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge } from "@athyper/ui/primitives";

export interface StatusTooltipData {
  statusCode: string;
  statusLabel: string;
  meaning: string;
  enteredAt: string | null;
  enteredBy: string | null;
  nextStates: string[];
}

export interface StatusTooltipProps {
  data: StatusTooltipData;
  className?: string;
}

export function StatusTooltipContent({ data, className }: StatusTooltipProps) {
  return (
    <div className={cn("max-w-xs space-y-2 p-1", className)}>
      <div className="flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-sm font-medium">{data.statusLabel}</span>
      </div>
      <p className="text-xs text-muted-foreground">{data.meaning}</p>

      {data.enteredAt && (
        <div className="text-xs text-muted-foreground">
          Since: {new Date(data.enteredAt).toLocaleString()}
          {data.enteredBy && ` by ${data.enteredBy}`}
        </div>
      )}

      {data.nextStates.length > 0 && (
        <div>
          <p className="text-[10px] font-medium uppercase text-muted-foreground mb-1">Next possible</p>
          <div className="flex flex-wrap gap-1">
            {data.nextStates.map((state) => (
              <Badge key={state} variant="outline" className="text-[10px]">{state}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
