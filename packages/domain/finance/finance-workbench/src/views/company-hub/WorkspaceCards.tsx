"use client";

import Link from "next/link";
import { ArrowRight, ClipboardList, Compass, SearchCode, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import type { WorkspaceCardCounts } from "../../lib/finance-setup.types";

interface CardSpec {
  key:      "explore" | "configure" | "operate";
  title:    string;
  subtitle: string;
  icon:     LucideIcon;
  hrefSlug: string;
  accent:   string;
  metric:   (counts: WorkspaceCardCounts) => { primary: string; secondary: string };
  chipTone: (counts: WorkspaceCardCounts) => "success" | "warning" | "info" | "muted" | "destructive";
  chipText: (counts: WorkspaceCardCounts) => string;
}

const SPECS: CardSpec[] = [
  {
    key:      "explore",
    title:    "Explore",
    subtitle: "Read-only browser for the chart, GL accounts, books & house banks.",
    icon:     Compass,
    hrefSlug: "explore",
    accent:   "from-info/15 to-info/5",
    metric:   (c) => ({
      primary:   `${c.explore.postableAccounts}`,
      secondary: `${c.explore.postableAccounts === 1 ? "postable account" : "postable accounts"}`,
    }),
    chipTone: () => "info",
    chipText: () => "Read-only",
  },
  {
    key:      "configure",
    title:    "Configure",
    subtitle: "GL controls, chart assignments, book assignments, and house-bank setup.",
    icon:     ClipboardList,
    hrefSlug: "configure",
    accent:   "from-warning/15 to-warning/5",
    metric:   (c) => ({
      primary:   `${c.configure.coveragePct}%`,
      secondary: `coverage · ${c.configure.pendingRows} pending`,
    }),
    chipTone: (c) =>
      c.configure.coveragePct === 100 ? "success"
        : c.configure.pendingRows === 0 ? "info"
        : "warning",
    chipText: (c) => c.configure.coveragePct === 100 ? "Complete" : "Needs work",
  },
  {
    key:      "operate",
    title:    "Operate",
    subtitle: "Live blockers, period gate, and reconciliation signals across finance runtime.",
    icon:     SearchCode,
    hrefSlug: "operate",
    accent:   "from-success/15 to-success/5",
    metric:   (c) => ({
      primary:   `${c.operate.openBlockers}`,
      secondary: `open ${c.operate.openBlockers === 1 ? "blocker" : "blockers"}`,
    }),
    chipTone: (c) => c.operate.openBlockers === 0 ? "success" : "destructive",
    chipText: (c) => c.operate.openBlockers === 0 ? "Clear" : "Blockers",
  },
];

export interface WorkspaceCardsProps {
  companyCode: string;
  counts:      WorkspaceCardCounts;
  className?:  string;
}

export function WorkspaceCards({ companyCode, counts, className }: WorkspaceCardsProps) {
  return (
    <section
      className={cn("grid grid-cols-1 gap-4 md:grid-cols-3", className)}
      aria-label="Finance setup workspaces"
    >
      {SPECS.map((spec) => {
        const Icon   = spec.icon;
        const metric = spec.metric(counts);
        const chipT  = spec.chipTone(counts);
        const chipTx = spec.chipText(counts);
        const href   = `/finance/setup/company/${encodeURIComponent(companyCode)}/${spec.hrefSlug}`;

        return (
          <Card
            key={spec.key}
            className={cn(
              "group relative overflow-hidden border-border/60 transition-shadow hover:shadow-md",
              "bg-gradient-to-br",
              spec.accent,
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                <CardTitle className="text-base">{spec.title}</CardTitle>
              </div>
              <Badge variant={chipT} size="sm">{chipTx}</Badge>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">{spec.subtitle}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">{metric.primary}</span>
                <span className="text-xs text-muted-foreground">{metric.secondary}</span>
              </div>
              <Button asChild variant="secondary" size="sm" className="mt-1 self-start">
                <Link href={href} aria-label={`Enter ${spec.title} for ${companyCode}`}>
                  Enter
                  <ArrowRight className="ml-1 h-3 w-3" aria-hidden />
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
