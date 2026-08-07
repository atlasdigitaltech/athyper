/**
 * @athyper/content-ui — JurisdictionChip
 *
 * Small badge that shows a tax jurisdiction's code with optional name tooltip.
 * Used inside AddressJurisdictionCard, TaxDeterminationCard, and the
 * AddressPicker dropdown rows.
 *
 * Phase 3 design: surface "TJ-AE [country]" / "TJ-IN-TN [state]" inline so
 * users see the tax implication of each address pick without leaving the page.
 */
"use client";

import { cn } from "@athyper/platform-theme/utils";

export interface JurisdictionChipProps {
  /** master.tax_jurisdiction.code (e.g. "TJ-AE", "TJ-IN-TN"). */
  code?: string | null;
  /** master.tax_jurisdiction.name (full label for tooltip). */
  name?: string | null;
  /** Jurisdiction type — drives color/icon (country | state | union | treaty | special_zone | …). */
  jurisdictionType?: string | null;
  /** When true, render in a disabled/muted style (e.g. unresolved). */
  muted?: boolean;
  /** When true, indicate the jurisdiction is missing/unresolved. */
  unresolved?: boolean;
  className?: string;
}

const TYPE_STYLES: Record<string, string> = {
  country:       "bg-sky-100 text-sky-800 ring-sky-200",
  state:         "bg-emerald-100 text-emerald-800 ring-emerald-200",
  province:      "bg-emerald-100 text-emerald-800 ring-emerald-200",
  county:        "bg-emerald-50 text-emerald-700 ring-emerald-100",
  city:          "bg-purple-100 text-purple-800 ring-purple-200",
  district:      "bg-purple-50 text-purple-700 ring-purple-100",
  union:         "bg-indigo-100 text-indigo-800 ring-indigo-200",
  treaty:        "bg-amber-100 text-amber-800 ring-amber-200",
  special_zone:  "bg-rose-100 text-rose-800 ring-rose-200",
};

export function JurisdictionChip(props: JurisdictionChipProps) {
  const { code, name, jurisdictionType, muted, unresolved, className } = props;

  if (unresolved || !code) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
          "bg-amber-50 text-amber-700 ring-amber-200",
          className,
        )}
        title="Tax jurisdiction unresolved — fix the address country/region"
      >
        ⚠ unresolved
      </span>
    );
  }

  const palette = jurisdictionType
    ? TYPE_STYLES[jurisdictionType] ?? "bg-slate-100 text-slate-700 ring-slate-200"
    : "bg-slate-100 text-slate-700 ring-slate-200";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset font-mono",
        muted ? "opacity-60" : palette,
        className,
      )}
      title={name ?? code}
    >
      {code}
      {jurisdictionType && (
        <span className="text-[9px] uppercase tracking-wide opacity-70 font-sans">
          {jurisdictionType.replace("_", " ")}
        </span>
      )}
    </span>
  );
}
