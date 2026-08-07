/**
 * @athyper/content-ui — TaxDeterminationCard (Phase 4)
 *
 * Surfaces the resolved tax_group + matched tax_resolution_rule for the
 * default (header) context. Shows the 4-jurisdiction matrix and the
 * shipto/shipfrom predicate result. Drives the "Why this rule?" drawer.
 *
 * The card calls the new /api/finance/tax/resolve endpoint (with explain=true
 * when the user clicks "Why?") and renders the result.
 */
"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@athyper/platform-theme/utils";
import { csrfFetch } from "@athyper/runtime-shared/client";
import { JurisdictionChip } from "./jurisdiction-chip";

// ─── Public types (mirror the service-side interfaces) ─────────────────

export interface TaxResolutionContext {
  tenantId:               string;
  docEntityCode:          string;
  billToJurisdictionId:   string | null;
  shipToJurisdictionId:   string | null;
  billFromJurisdictionId: string | null;
  shipFromJurisdictionId: string | null;
  counterpartyTaxStatus:  string | null;
  commodityCategoryId:    string | null;
  supplierIndustryCode:   string | null;
  docDate?:               string;          // ISO date; defaults to today
}

export interface ResolverWinner {
  taxGroupId: string;
  ruleId:     string;
  ruleCode:   string;
}

export interface ResolverCandidate {
  ruleId:              string;
  ruleCode:            string;
  ruleName:            string;
  resolvedTaxGroupId:  string;
  priority:            number;
  matched:             boolean;
  reasons:             string[];
}

export interface JurisdictionLookup {
  /** Map id → { code, name } for quick chip rendering. */
  byId: Record<string, { code: string; name: string; type?: string | null } | undefined>;
}

export interface TaxDeterminationCardProps {
  /** Full context — used for the resolver call. */
  context: TaxResolutionContext;
  /** Pre-resolved jurisdiction lookup map for chip rendering. */
  jurisdictionLookup?: JurisdictionLookup;
  /** When true, indicate the snapshot is frozen (post-submit). */
  readOnly?: boolean;
  /** When true, render a compact view without action buttons. */
  compact?: boolean;
  /** Optional callback when "Recompute" pressed. */
  onRecompute?: () => void;
  /** Optional callback to view full explainer in a drawer. */
  onExplainerOpen?: (candidates: ResolverCandidate[]) => void;
  className?: string;
}

// ─── Component ─────────────────────────────────────────────────────────

export function TaxDeterminationCard(props: TaxDeterminationCardProps) {
  const {
    context, jurisdictionLookup, readOnly,
    onRecompute, onExplainerOpen, className,
  } = props;

  const [winner, setWinner] = useState<ResolverWinner | null>(null);
  const [candidates, setCandidates] = useState<ResolverCandidate[] | null>(null);
  const [taxGroupCode, setTaxGroupCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explaining, setExplaining] = useState(false);

  const resolve = useCallback(async (explain = false) => {
    if (explain) setExplaining(true); else setLoading(true);
    try {
      const r = await csrfFetch(`/api/relay/finance/tax/resolve`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          doc_entity_code:          context.docEntityCode,
          billto_jurisdiction_id:   context.billToJurisdictionId,
          shipto_jurisdiction_id:   context.shipToJurisdictionId,
          billfrom_jurisdiction_id: context.billFromJurisdictionId,
          shipfrom_jurisdiction_id: context.shipFromJurisdictionId,
          counterparty_tax_status:  context.counterpartyTaxStatus,
          commodity_category_id:    context.commodityCategoryId,
          supplier_industry_code:   context.supplierIndustryCode,
          doc_date:                 context.docDate,
          explain,
        }),
      });
      if (!r.ok) return;
      const json = await r.json() as {
        winner: ResolverWinner | null;
        candidates: ResolverCandidate[] | null;
      };
      setWinner(json.winner);
      if (explain) setCandidates(json.candidates ?? []);
    } catch {
      setWinner(null);
    } finally {
      setLoading(false);
      setExplaining(false);
    }
  }, [context]);

  // Auto-resolve when context changes
  useEffect(() => { void resolve(false); }, [resolve]);

  // Resolve tax_group code via a side query (best-effort; not blocking)
  useEffect(() => {
    if (!winner?.taxGroupId) { setTaxGroupCode(null); return; }
    // Cheap fetch via a generic /api/control/tax-groups/:id endpoint if available;
    // otherwise display the raw UUID. (Code lookup is best-effort.)
    setTaxGroupCode(null);
  }, [winner?.taxGroupId]);

  const isResolved = !!winner;
  const hasContext = (
    context.billToJurisdictionId || context.shipToJurisdictionId ||
    context.billFromJurisdictionId || context.shipFromJurisdictionId
  );

  const chip = (id: string | null) => {
    if (!id) return <span className="text-slate-400 italic text-[11px]">—</span>;
    const meta = jurisdictionLookup?.byId[id];
    return (
      <JurisdictionChip
        code={meta?.code ?? id.slice(0, 8) + "…"}
        name={meta?.name}
        jurisdictionType={meta?.type ?? null}
      />
    );
  };

  return (
    <div
      data-testid="tax-determination-card"
      className={cn(
        "rounded border border-slate-200 bg-white p-3 flex flex-col gap-2",
        readOnly && "bg-slate-50",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">
          Tax Determination <span className="text-slate-400 font-normal">· default context</span>
        </h4>
        {loading ? (
          <span className="text-[10px] text-slate-400 italic">Resolving…</span>
        ) : isResolved ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset bg-emerald-100 text-emerald-700 ring-emerald-200">
            ✓ RESOLVED
          </span>
        ) : hasContext ? (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset bg-amber-100 text-amber-700 ring-amber-200">
            NO RULE MATCHED
          </span>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset bg-slate-100 text-slate-500 ring-slate-200">
            CONTEXT MISSING
          </span>
        )}
      </div>

      {isResolved ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-xs">
            <span className="text-slate-500">Matched rule: </span>
            <span className="font-mono font-semibold text-slate-800">{winner!.ruleCode}</span>
          </div>
          <div className="text-xs">
            <span className="text-slate-500">Resolved group: </span>
            <span className="font-mono font-semibold text-slate-800">{taxGroupCode ?? winner!.taxGroupId.slice(0, 12) + "…"}</span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-400 italic">
          {hasContext
            ? "No rule matched this context. Pick a tax group manually on each line."
            : "Pick supplier and addresses to compute default tax."}
        </div>
      )}

      {/* Jurisdiction matrix */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-slate-100 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">bill-to:</span> {chip(context.billToJurisdictionId)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">ship-to:</span> {chip(context.shipToJurisdictionId)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">bill-from:</span> {chip(context.billFromJurisdictionId)}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">ship-from:</span> {chip(context.shipFromJurisdictionId)}
        </div>
      </div>

      {/* Predicate hint */}
      {context.shipToJurisdictionId && context.shipFromJurisdictionId && (
        <div className="text-[11px] text-slate-600">
          ship-to/ship-from: {" "}
          {context.shipToJurisdictionId === context.shipFromJurisdictionId
            ? <span className="font-semibold text-emerald-700">MATCH (intra-state)</span>
            : <span className="font-semibold text-rose-700">MISMATCH (inter-state)</span>}
        </div>
      )}

      {/* Actions */}
      {!readOnly && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => { void resolve(false); onRecompute?.(); }}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
            disabled={loading}
          >
            Recompute
          </button>
          <button
            type="button"
            onClick={async () => {
              await resolve(true);
              if (candidates) onExplainerOpen?.(candidates);
            }}
            className="text-[11px] font-medium text-slate-600 hover:text-slate-900"
            disabled={explaining}
          >
            Why this rule?
          </button>
        </div>
      )}
    </div>
  );
}
