"use client";

import { CheckCircle2, Power, XCircle } from "lucide-react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from "@athyper/platform-ui/primitives";
import { cn } from "@athyper/platform-theme/utils";
import {
  useExploreBooks,
  useExploreHouseBanks,
  type ExploreHouseBank,
  type HouseBankChipTone,
} from "../../hooks/useFinanceExplore";
import { useToggleHouseBank } from "../../hooks/useFinanceSetupMutations";
import { DefinitionStateChip } from "../company-hub/DefinitionStateChip";

const CHIP_LABEL: Record<HouseBankChipTone, string> = {
  active:    "Active",
  inactive:  "Inactive",
  effective: "Effective",
  expired:   "Expired",
  future:    "Future",
};

const CHIP_VARIANT: Record<HouseBankChipTone, "success" | "warning" | "destructive" | "muted"> = {
  active:    "success",
  effective: "success",
  inactive:  "muted",
  future:    "warning",
  expired:   "destructive",
};

function ChainChip({ label, tone }: { label: string; tone: HouseBankChipTone }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <Badge variant={CHIP_VARIANT[tone]} size="sm">{CHIP_LABEL[tone]}</Badge>
    </span>
  );
}


// ─── Books panel ────────────────────────────────────────────────────────────

export function BooksListPanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useExploreBooks(companyCode);

  return (
    <div className={cn("rounded-lg border bg-card", className)}>
      <div className="border-b p-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Ledger books
        </h3>
      </div>

      {q.isLoading ? (
        <div className="space-y-2 p-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : q.isError ? (
        <p className="p-6 text-sm text-destructive">Failed to load books.</p>
      ) : (q.data?.length ?? 0) === 0 ? (
        <p className="p-6 text-sm text-muted-foreground">No ledger books configured.</p>
      ) : (
        <ul role="list" className="divide-y">
          {q.data!.map((b) => (
            <li key={b.bookId} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{b.bookName}</span>
                  <span className="font-mono text-xs text-muted-foreground">{b.bookCode}</span>
                  {b.isPrimary && <Badge variant="info" size="sm">primary</Badge>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {b.purpose && <span>{b.purpose}</span>}
                  {b.currencyCode && <span>· {b.currencyCode}</span>}
                  {b.fiscalYearStart && <span>· FY start {b.fiscalYearStart}</span>}
                </div>
              </div>
              <DefinitionStateChip
                state={b.status as "draft" | "active" | "inactive"}
                vocabulary={["draft", "active", "inactive"]}
                objectKind="ledger_book"
                size="sm"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


// ─── House banks panel ──────────────────────────────────────────────────────

export function HouseBanksExplorePanel({ companyCode, className }: { companyCode: string; className?: string }) {
  const q = useExploreHouseBanks(companyCode);

  if (q.isLoading) {
    return (
      <div className={cn("space-y-2", className)}>
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-lg" />)}
      </div>
    );
  }
  if (q.isError) return <p className="text-sm text-destructive">Failed to load house banks.</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
        No house banks configured. Add one from Configure → House Banks.
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-3 lg:grid-cols-2", className)}>
      {rows.map((bank) => <HouseBankCard key={bank.configId} bank={bank} companyCode={companyCode} />)}
    </div>
  );
}

function HouseBankCard({ bank, companyCode }: { bank: ExploreHouseBank; companyCode: string }) {
  const toggle = useToggleHouseBank();
  const isActive = bank.configStatus === "active";
  return (
    <Card className={cn(bank.isReady ? "border-success/40" : "border-warning/60")}>
      <CardHeader className="space-y-1">
        <div className="flex items-center gap-2">
          {bank.isReady
            ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            : <XCircle className="h-4 w-4 text-warning" aria-hidden />}
          <CardTitle className="text-base">{bank.partyName}</CardTitle>
        </div>
        <p className="text-xs text-muted-foreground">
          {bank.bankAccountLabel} · {bank.usageType.toLowerCase()}
          {bank.glAccountCode ? ` · GL ${bank.glAccountCode}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <ChainChip label="Party"   tone={bank.partyStatus} />
          <ChainChip label="Account" tone={bank.bankAccountStatus} />
          <ChainChip label="Link"    tone={bank.linkStatus} />
          <ChainChip label="Config"  tone={bank.configStatus} />
        </div>
        {!bank.isReady && bank.notReadyReasons.length > 0 ? (
          <p className="text-xs text-warning">
            Blocked by: {bank.notReadyReasons.join(", ")}
          </p>
        ) : null}
        <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
          {bank.isDefaultDisbursement && <Badge variant="info" size="sm">default disburse</Badge>}
          {bank.isDefaultCollection && <Badge variant="info" size="sm">default collect</Badge>}
          <span className="ml-auto">
            {bank.effectiveFrom}{bank.effectiveUntil ? ` → ${bank.effectiveUntil}` : ""}
          </span>
        </div>
        <div className="flex justify-end border-t pt-2">
          <Button
            variant={isActive ? "ghost" : "secondary"}
            size="sm"
            onClick={() => toggle.mutate({ configId: bank.configId, companyCode, activate: !isActive })}
            disabled={toggle.isPending}
            aria-label={isActive ? "Deactivate house bank" : "Activate house bank"}
          >
            <Power className="mr-1 h-3.5 w-3.5" aria-hidden />
            {toggle.isPending ? "Saving…" : isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
