import type { ReactElement } from "react";
import { CheckCircle, XCircle, Clock, Forward, AlertTriangle } from "lucide-react";
import { cn } from "@athyper/platform-theme/utils";

interface IconConfig {
  Icon: React.ElementType;
  colorClass: string;
}

const ICON_MAP: Record<string, IconConfig> = {
  approved:  { Icon: CheckCircle,   colorClass: "text-success" },
  rejected:  { Icon: XCircle,       colorClass: "text-destructive" },
  pending:   { Icon: Clock,         colorClass: "text-warning" },
  delegated: { Icon: Forward,       colorClass: "text-info" },
  timed_out: { Icon: AlertTriangle, colorClass: "text-destructive" },
};

const FALLBACK: IconConfig = { Icon: Clock, colorClass: "text-muted-foreground" };

export function workflowStatusIcon(status: string, className?: string): ReactElement {
  const { Icon, colorClass } = ICON_MAP[status] ?? FALLBACK;
  return <Icon aria-label={status} className={cn("h-3.5 w-3.5", colorClass, className)} />;
}
