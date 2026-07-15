/**
 * @athyper/content-ui — PartyCard (Phase 4)
 *
 * Generic party card for the buyer or seller on a document. Shows party code,
 * name, tax registration, jurisdiction, and tax-status. Reused for Company
 * Code (buyer side) and Supplier/Customer (seller / counterparty side).
 */
"use client";

import { cn } from "@athyper/theme/utils";
import { JurisdictionChip } from "./jurisdiction-chip";

export interface PartyCardProps {
  /** "BUYER", "SELLER", "SUPPLIER", "CUSTOMER" — uppercased role label */
  role: string;
  /** "Company Code" / "Supplier" / "Customer" — descriptive subtitle */
  kind: string;
  /** Display name */
  name?: string | null;
  /** Code */
  code?: string | null;
  /** Country code (ISO 2-letter) */
  countryCode?: string | null;
  /** Tax registration number (TIN / VAT / GSTIN / EIN) */
  taxRegistrationNo?: string | null;
  /** Tax jurisdiction code + name (from owner's tax_jurisdiction_id) */
  jurisdictionCode?: string | null;
  jurisdictionName?: string | null;
  /** Counterparty tax status */
  taxStatus?: string | null;
  /** Empty state CTA — opens a party picker */
  onChange?: () => void;
  /** Read-only (post-submit lock) */
  readOnly?: boolean;
  className?: string;
}

const STATUS_PALETTE: Record<string, string> = {
  REGISTERED:   "bg-emerald-100 text-emerald-800 ring-emerald-200",
  UNREGISTERED: "bg-amber-100 text-amber-800 ring-amber-200",
  EXEMPT:       "bg-slate-100 text-slate-700 ring-slate-200",
  FOREIGN:      "bg-indigo-100 text-indigo-800 ring-indigo-200",
  TREATY:       "bg-purple-100 text-purple-800 ring-purple-200",
};

export function PartyCard(props: PartyCardProps) {
  const {
    role, kind, name, code, countryCode, taxRegistrationNo,
    jurisdictionCode, jurisdictionName, taxStatus,
    onChange, readOnly, className,
  } = props;

  const isEmpty = !name && !code;

  return (
    <div
      data-testid={`party-card-${role.toLowerCase()}`}
      className={cn(
        "rounded border border-slate-200 bg-white p-3 flex flex-col gap-2 min-h-[140px]",
        readOnly && "bg-slate-50",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] uppercase tracking-wide font-semibold text-slate-600">
          {role} <span className="font-normal text-slate-400">· {kind}</span>
        </h4>
        {readOnly && (
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset bg-rose-100 text-rose-700 ring-rose-200">
            LOCKED
          </span>
        )}
      </div>

      {isEmpty ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-xs text-slate-400 italic">
            {readOnly ? "Not set" : "Pick a party"}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-1.5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-mono text-slate-500">{code ?? "—"}</span>
            <span className="text-sm font-semibold text-slate-800 truncate">{name ?? "—"}</span>
          </div>
          {countryCode && (
            <div className="text-[11px] text-slate-500">
              Country: <span className="font-medium text-slate-700">{countryCode}</span>
            </div>
          )}
          {taxRegistrationNo && (
            <div className="text-[11px] text-slate-500">
              Tax reg: <span className="font-mono text-slate-700">{taxRegistrationNo}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-0.5">
            {jurisdictionCode && (
              <JurisdictionChip code={jurisdictionCode} name={jurisdictionName} />
            )}
            {taxStatus && (
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[9px] font-semibold ring-1 ring-inset",
                  STATUS_PALETTE[taxStatus] ?? "bg-slate-100 text-slate-700 ring-slate-200",
                )}
              >
                {taxStatus}
              </span>
            )}
          </div>
        </div>
      )}

      {!readOnly && onChange && (
        <button
          type="button"
          onClick={onChange}
          className="self-start text-[11px] font-medium text-slate-600 hover:text-slate-900"
        >
          {isEmpty ? "Pick…" : "Change…"}
        </button>
      )}
    </div>
  );
}
