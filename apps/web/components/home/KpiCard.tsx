"use client";

import { cn } from "@athyper/theme/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";

export interface KpiCardProps {
  title: string;
  value: string | number;
  sub?: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  loading?: boolean;
}

export function KpiCard({ title, value, sub, Icon, iconClass, loading }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-4 w-4", iconClass ?? "text-muted-foreground")} />
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-bold">{loading ? "—" : value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
