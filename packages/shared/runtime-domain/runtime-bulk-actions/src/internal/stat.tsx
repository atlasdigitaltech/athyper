import type { LucideIcon } from "lucide-react";
import { cn } from "@athyper/theme/utils";

export interface StatProps {
  icon:    LucideIcon;
  label:   string;
  value:   number;
  variant: "success" | "error" | "neutral";
}

export function Stat({ icon: Icon, label, value, variant }: StatProps) {
  const color =
    variant === "success" ? "text-success" :
    variant === "error"   ? "text-destructive" :
                            "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5">
      <Icon aria-hidden="true" className={cn("h-3.5 w-3.5 shrink-0", color)} />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-medium tabular-nums">{value}</span>
    </div>
  );
}
