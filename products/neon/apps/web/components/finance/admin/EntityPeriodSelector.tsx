"use client";

// components/finance/admin/EntityPeriodSelector.tsx
//
// Phase 9A: Reusable entity/fiscal year/period selector for Close Control Tower.
// Provides context switching without full page navigation.

import { useCallback } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface EntityPeriodSelectorProps {
  entityCode: string;
  fiscalYear: number;
  periodNumber: number;
  onEntityChange: (entityCode: string) => void;
  onFiscalYearChange: (fiscalYear: number) => void;
  onPeriodChange: (periodNumber: number) => void;
  /** Available entities (codes). If empty, free-text entry. */
  entities?: string[];
  /** Available fiscal years. Default: [current-1, current, current+1] */
  fiscalYears?: number[];
  /** Max period number. Default: 12 */
  maxPeriod?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EntityPeriodSelector({
  entityCode,
  fiscalYear,
  periodNumber,
  onEntityChange,
  onFiscalYearChange,
  onPeriodChange,
  entities = [],
  fiscalYears,
  maxPeriod = 12,
}: EntityPeriodSelectorProps) {
  const currentYear = new Date().getFullYear();
  const years = fiscalYears ?? [currentYear - 1, currentYear, currentYear + 1];
  const periods = Array.from({ length: maxPeriod }, (_, i) => i + 1);

  return (
    <div className="flex items-center gap-2">
      {/* Entity selector */}
      {entities.length > 0 ? (
        <Select value={entityCode} onValueChange={onEntityChange}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue placeholder="Entity" />
          </SelectTrigger>
          <SelectContent>
            {entities.map((e) => (
              <SelectItem key={e} value={e} className="text-xs">
                {e}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="flex h-8 items-center rounded border px-2 text-xs font-medium">
          {entityCode}
        </div>
      )}

      {/* Fiscal year selector */}
      <Select
        value={String(fiscalYear)}
        onValueChange={(v) => onFiscalYearChange(parseInt(v))}
      >
        <SelectTrigger className="h-8 w-[90px] text-xs">
          <SelectValue placeholder="FY" />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)} className="text-xs">
              FY {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Period selector */}
      <Select
        value={String(periodNumber)}
        onValueChange={(v) => onPeriodChange(parseInt(v))}
      >
        <SelectTrigger className="h-8 w-[80px] text-xs">
          <SelectValue placeholder="Period" />
        </SelectTrigger>
        <SelectContent>
          {periods.map((p) => (
            <SelectItem key={p} value={String(p)} className="text-xs">
              P{p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
