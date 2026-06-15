/**
 * @athyper/content-ui — PiLineDrawer
 *
 * Spec v1.1 §4.3 — composite of the four bands plus optional right
 * rail. Wires PIL + PC + AD for one purchase_invoice_line.
 *
 *   Band 1: Line Recap (item, qty, rate, net, gross, match, status)
 *   Band 2: Component Waterfall  (PricingComponentWaterfall)
 *   Band 3: Gross (locked bridge — explicit boundary between PC and AD)
 *   Band 4: Distribution         (AccountingDistributionPanel)
 *
 * Optional `RightRail` slot at wider viewports holds validation /
 * supersession / audit / inheritance digests per §4.3.
 */
"use client";

import { Lock, ShieldCheck, History, FileSearch, CornerDownRight } from "lucide-react";
import { cn } from "@athyper/theme/utils";
import { resolveSemanticColors } from "@athyper/theme/semantic-colors";
import { CurrencyTriad } from "../money/CurrencyTriad";
import { MatchBadge } from "../match/MatchBadge";
import { PricingComponentWaterfall } from "../pricing-components/PricingComponentWaterfall";
import { AccountingDistributionPanel } from "../distributions/AccountingDistributionPanel";
import type {
  PurchaseInvoiceLine,
  PricingComponent,
  AccountingDistribution,
  AdAccountSource,
  EditAffordance,
} from "../../purchase-invoice/types";

export interface PiLineDrawerProps {
  line: PurchaseInvoiceLine;
  components: PricingComponent[];
  distributions: AccountingDistribution[];

  /** Edit affordance for the component band. */
  componentsAffordance: EditAffordance;
  /** Edit affordance for the distribution band (may differ from PC). */
  distributionsAffordance: EditAffordance;

  // PC actions
  onAddComponent?: () => void;
  /** Optional tax-specific add affordance (renders alongside `onAddComponent`). */
  onAddTaxComponent?: () => void;
  onEditComponent?: (componentId: string) => void;
  onReplaceComponent?: (componentId: string) => void;
  onDeleteComponent?: (componentId: string) => void;
  onJumpToHeaderRow?: (sourceHeaderPcId: string) => void;

  // AD actions
  onAddDistribution?: () => void;
  onEditDistribution?: (adId: string) => void;
  onDeleteDistribution?: (adId: string) => void;
  onViewAudit?: (adId: string) => void;

  // Match exception jump (consumer navigates to the open match_exception row).
  onJumpToMatchException?: () => void;

  // AD empty-state hints (forwarded to the AD panel)
  emptyResolutionHint?: string;
  emptyResolutionPath?: AdAccountSource;

  className?: string;
}

// ── Band 1: Line Recap ─────────────────────────────────────────────

function LineRecapBand({
  line,
  onJumpToMatchException,
}: {
  line: PurchaseInvoiceLine;
  onJumpToMatchException?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 px-3 py-2 border-b border-border bg-muted/40">
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="text-xs text-muted-foreground">
          Line {line.line_no} · {line.uom_code}
        </div>
        <div className="text-sm font-medium truncate">{line.item_description}</div>
      </div>

      <div className="text-xs flex items-center gap-4">
        <div>
          <span className="text-muted-foreground">Qty</span>{" "}
          <span className="tabular-nums">{line.quantity}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Rate</span>{" "}
          <CurrencyTriad
            amount={line.unit_price}
            currencyCode={line.currency_code}
            baseCurrencyCode={line.base_currency_code}
            exchangeRate={line.exchange_rate}
          />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <MatchBadge
          status={line.match_status}
          matchedQuantity={line.matched_quantity}
          totalQuantity={line.quantity}
          onClick={line.match_status === "match_exception" ? onJumpToMatchException : undefined}
        />
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {line.status}
        </span>
      </div>
    </div>
  );
}

// ── Band 3: Gross (locked bridge) ──────────────────────────────────

function GrossBridge({
  line,
}: {
  line: PurchaseInvoiceLine;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-y border-border bg-muted/60">
      <div className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Lock className="h-3 w-3" aria-hidden />
        Gross — stored cache · read-only
      </div>
      <div className="text-base font-medium tabular-nums">
        <CurrencyTriad
          amount={line.gross_amount}
          currencyCode={line.currency_code}
          baseCurrencyCode={line.base_currency_code}
          exchangeRate={line.exchange_rate}
        />
      </div>
    </div>
  );
}

// ── Right rail digest ──────────────────────────────────────────────

interface RightRailItem {
  Icon: typeof ShieldCheck;
  label: string;
  /** Optional badge text (count or status). */
  count?: number | string;
  intent?: "success" | "warning" | "error" | "info" | "neutral";
  onClick?: () => void;
}

function RightRail({
  items,
}: {
  items: RightRailItem[];
}) {
  if (items.length === 0) return null;
  return (
    <aside className="hidden xl:flex flex-col gap-2 w-56 shrink-0 border-l border-border bg-card px-3 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Digest
      </div>
      <div className="flex flex-col gap-1">
        {items.map((item, idx) => {
          const colors = item.intent ? resolveSemanticColors(item.intent) : null;
          const content = (
            <div className={cn(
              "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
              item.onClick && "hover:bg-muted/60 cursor-pointer",
            )}>
              <item.Icon className={cn("h-3.5 w-3.5", colors?.text)} aria-hidden />
              <span className="flex-1 truncate">{item.label}</span>
              {item.count != null && (
                <span className="tabular-nums text-muted-foreground">{item.count}</span>
              )}
            </div>
          );
          return item.onClick ? (
            <button key={idx} type="button" onClick={item.onClick} className="text-left">
              {content}
            </button>
          ) : (
            <div key={idx}>{content}</div>
          );
        })}
      </div>
    </aside>
  );
}

// ── Build digest items from the line state ─────────────────────────

function buildRightRailItems({
  line,
  components,
  distributions,
  lineGrossAmount,
  onViewAudit,
  onJumpToMatchException,
}: {
  line: PurchaseInvoiceLine;
  components: PricingComponent[];
  distributions: AccountingDistribution[];
  lineGrossAmount: number;
  onViewAudit?: (adId: string) => void;
  onJumpToMatchException?: () => void;
}): RightRailItem[] {
  const items: RightRailItem[] = [];

  // AD balance summary
  const adSum = distributions.reduce((acc, d) => acc + d.distributed_amount, 0);
  const adBalanced = Math.abs(adSum - lineGrossAmount) <= 0.005;
  items.push({
    Icon: ShieldCheck,
    label: "AD balanced",
    count: adBalanced ? "ok" : "off",
    intent: adBalanced ? "success" : "error",
  });

  // Match exception
  if (line.match_status === "match_exception") {
    items.push({
      Icon: ShieldCheck,
      label: "Match exception open",
      intent: "error",
      onClick: onJumpToMatchException,
    });
  }

  // Supersession counts
  const supersededCount = components.reduce((acc, c) => acc + (c.chain?.length ?? 0), 0);
  if (supersededCount > 0) {
    items.push({
      Icon: History,
      label: "Components superseded",
      count: supersededCount,
      intent: "info",
    });
  }

  // Inheritance counts
  const inheritedCount = components.filter((c) => c.origin === "inherited").length;
  if (inheritedCount > 0) {
    items.push({
      Icon: CornerDownRight,
      label: "From header",
      count: inheritedCount,
      intent: "info",
    });
  }

  // Audit count
  const auditCount = distributions.reduce((acc, d) => acc + d.resolution_audit_count, 0);
  if (auditCount > 0) {
    const firstWithAudit = distributions.find((d) => d.resolution_audit_count > 0);
    items.push({
      Icon: FileSearch,
      label: "AD resolution records",
      count: auditCount,
      intent: "info",
      onClick: firstWithAudit && onViewAudit ? () => onViewAudit(firstWithAudit.id) : undefined,
    });
  }

  return items;
}

// ── Main composite ────────────────────────────────────────────────

export function PiLineDrawer({
  line,
  components,
  distributions,
  componentsAffordance,
  distributionsAffordance,
  onAddComponent,
  onAddTaxComponent,
  onEditComponent,
  onReplaceComponent,
  onDeleteComponent,
  onJumpToHeaderRow,
  onAddDistribution,
  onEditDistribution,
  onDeleteDistribution,
  onViewAudit,
  onJumpToMatchException,
  emptyResolutionHint,
  emptyResolutionPath,
  className,
}: PiLineDrawerProps) {
  const rightRailItems = buildRightRailItems({
    line,
    components,
    distributions,
    lineGrossAmount: line.gross_amount,
    onViewAudit,
    onJumpToMatchException,
  });

  return (
    <div className={cn("flex border border-border rounded-md bg-card overflow-hidden", className)}>
      <div className="flex-1 min-w-0">
        <LineRecapBand line={line} onJumpToMatchException={onJumpToMatchException} />

        {/* Band 2: Component Waterfall. Empty → omit per UI-P6. */}
        <div className="px-3 py-3">
          {components.length === 0 ? (
            <div className="text-xs italic text-muted-foreground px-3 py-2">
              No components. Net = Gross{" "}
              <CurrencyTriad
                amount={line.net_amount}
                currencyCode={line.currency_code}
                baseCurrencyCode={line.base_currency_code}
                exchangeRate={line.exchange_rate}
                className="not-italic"
              />
            </div>
          ) : (
            <PricingComponentWaterfall
              components={components}
              lineNetAmount={line.net_amount}
              currencyCode={line.currency_code}
              baseCurrencyCode={line.base_currency_code}
              exchangeRate={line.exchange_rate}
              affordance={componentsAffordance}
              onAdd={onAddComponent}
              onAddTax={onAddTaxComponent}
              onEdit={onEditComponent}
              onReplace={onReplaceComponent}
              onDelete={onDeleteComponent}
              onJumpToHeaderRow={onJumpToHeaderRow}
            />
          )}
        </div>

        {/* Band 3: Gross bridge */}
        <GrossBridge line={line} />

        {/* Band 4: Distribution */}
        <div className="px-3 py-3">
          <AccountingDistributionPanel
            distributions={distributions}
            lineGrossAmount={line.gross_amount}
            currencyCode={line.currency_code}
            baseCurrencyCode={line.base_currency_code}
            exchangeRate={line.exchange_rate}
            affordance={distributionsAffordance}
            onAdd={onAddDistribution}
            onEdit={onEditDistribution}
            onDelete={onDeleteDistribution}
            onViewAudit={onViewAudit}
            emptyResolutionHint={emptyResolutionHint}
            emptyResolutionPath={emptyResolutionPath}
          />
        </div>
      </div>

      {/* Right rail (xl+ viewports only) */}
      <RightRail items={rightRailItems} />
    </div>
  );
}
