import { Info } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { Badge } from "@athyper/ui/primitives";
import { formatDate } from "../utils/formatDate";

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
  const nextStates = data.nextStates ?? [];

  return (
    <div className={cn("max-w-xs space-y-2 p-1", className)}>
      <div className="flex items-center gap-2">
        <Info aria-hidden className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="[font-size:var(--doc-field-value-size)] font-medium">
          {data.statusLabel}
        </span>
      </div>

      <p className="[font-size:var(--doc-support-size)] text-muted-foreground">{data.meaning}</p>

      {data.enteredAt && (
        <div className="[font-size:var(--doc-support-size)] text-muted-foreground">
          Since: {formatDate(data.enteredAt)}
          {data.enteredBy && ` by ${data.enteredBy}`}
        </div>
      )}

      {nextStates.length > 0 && (
        <div>
          <p className="section-label mb-1">Next possible</p>
          <div className="flex flex-wrap gap-1">
            {nextStates.map((state) => (
              <Badge key={state} variant="outline" className="[font-size:var(--doc-badge-size)]">
                {state}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
