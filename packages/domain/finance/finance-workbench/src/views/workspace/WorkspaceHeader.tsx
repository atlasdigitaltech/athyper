"use client";

import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { Badge, Button } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";
import { useCompanyHub } from "../../hooks/useCompanyHub";
import { PostabilityChip } from "../company-hub/PostabilityChip";

/**
 * Shared header for Explore / Configure / Operate workspaces.
 * Shows the company badge, current period+book, postability, and a Back-to-Hub button.
 */
export interface WorkspaceHeaderProps {
  companyCode: string;
  workspace:   "explore" | "configure" | "operate";
  className?:  string;
}

const WORKSPACE_LABEL: Record<WorkspaceHeaderProps["workspace"], string> = {
  explore:   "Explore",
  configure: "Configure",
  operate:   "Operate",
};

const WORKSPACE_TONE: Record<WorkspaceHeaderProps["workspace"], "info" | "warning" | "success"> = {
  explore:   "info",
  configure: "warning",
  operate:   "success",
};

export function WorkspaceHeader({ companyCode, workspace, className }: WorkspaceHeaderProps) {
  const hub = useCompanyHub({ companyCode });
  const hubHref = `/finance/setup/company/${encodeURIComponent(companyCode)}`;

  return (
    <header
      className={cn(
        "flex flex-col gap-3 rounded-lg border bg-card p-4 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={hubHref} aria-label="Back to Finance Settings">
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="ml-1">Settings</span>
          </Link>
        </Button>
        <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
        <div className="flex flex-col leading-tight">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            Finance Settings · {WORKSPACE_LABEL[workspace]}
          </span>
          <span className="text-base font-semibold">
            {hub.data?.companyName ?? companyCode}
            <span className="ml-2 text-sm font-normal text-muted-foreground">· {companyCode}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={WORKSPACE_TONE[workspace]} size="sm">
          {WORKSPACE_LABEL[workspace]}
        </Badge>
        {hub.data ? (
          <>
            <span className="text-xs text-muted-foreground">
              Book <span className="font-medium text-foreground">{hub.data.currentBookLabel}</span>
              {" · "}FY{hub.data.currentFiscalYear} · P{String(hub.data.currentPeriodNumber).padStart(2, "0")}
            </span>
            <PostabilityChip
              chip={hub.data.periodPostability.chip}
              reasonCode={hub.data.periodPostability.reasonCode}
              size="sm"
            />
          </>
        ) : null}
      </div>
    </header>
  );
}
