"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { FinanceScope } from "../lib/scope";
import { periodLabel } from "../lib/period";
import { useScopeOptions } from "./useScopeOptions";

const RELATIVE_LABELS: Record<string, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  last_90_days: "Last 90 days",
  rolling_12_months: "Rolling 12 months",
};

const DATE_PRESET_LABELS: Record<string, string> = {
  this_month: "This month",
  this_quarter: "This quarter",
  fiscal_ytd: "Fiscal YTD",
  last_month: "Last month",
  custom: "Custom range",
};

export interface StatementReportingLens {
  isFiscalLens: boolean;
  headerLabel: string;
  summarySubtitle: string;
  currentLabel: string;
  priorLabel: string;
  comparisonLabel: string;
}

function formatDateLabel(value: string | null): string {
  if (!value) return "";
  // Anchor at UTC noon — same date regardless of viewer TZ. This is a business
  // date, so we render via @athyper/temporal's TZ-immune helper would be ideal;
  // sticking with Intl here for parity with the rest of the lens UI.
  // eslint-disable-next-line no-direct-date-parse -- reason: explicit UTC noon anchor; value already validated as YYYY-MM-DD upstream.
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fiscalPointForDate(value: string, fiscalYearStartMonth: number): { fiscalYear: number; period: number } | null {
  // Parse the YMD components directly — no Date object, no TZ. The previous
  // implementation parsed via a local-time Date constructor which could shift
  // the fiscal point by a day for off-UTC users.
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return null;
  const year = Number(parts[1]);
  const month = Number(parts[2]); // 1-12
  const fiscalYear = month < fiscalYearStartMonth ? year - 1 : year;
  const period = ((month - fiscalYearStartMonth + 12) % 12) + 1;
  return { fiscalYear, period };
}

function fiscalCoverageLabel(dateFrom: string | null, dateTo: string | null, fiscalYearStartMonth: number): string | null {
  if (!dateFrom && !dateTo) return null;

  const fromPoint = dateFrom ? fiscalPointForDate(dateFrom, fiscalYearStartMonth) : null;
  const toPoint = dateTo ? fiscalPointForDate(dateTo, fiscalYearStartMonth) : null;
  if (!fromPoint && !toPoint) return null;

  const formatPoint = (point: { fiscalYear: number; period: number }) =>
    `FY ${point.fiscalYear} P${point.period}`;

  if (fromPoint && toPoint) {
    if (fromPoint.fiscalYear === toPoint.fiscalYear && fromPoint.period === toPoint.period) {
      return formatPoint(fromPoint);
    }
    return `${formatPoint(fromPoint)} - ${formatPoint(toPoint)}`;
  }

  return fromPoint ? `From ${formatPoint(fromPoint)}` : `To ${formatPoint(toPoint!)}`;
}

function fiscalLensLabel(scope: FinanceScope, fiscalYearStartMonth: number): string {
  if (scope.period === null || scope.period === undefined) {
    return `FY ${scope.fiscalYear} - Full year`;
  }
  return `FY ${scope.fiscalYear} - ${periodLabel(scope.fiscalYear, scope.period, fiscalYearStartMonth)}`;
}

export function useStatementReportingLens(scope: FinanceScope): StatementReportingLens {
  const searchParams = useSearchParams();
  const { data: scopeOptions } = useScopeOptions();

  const activeCompany = useMemo(() => {
    const companies = scopeOptions?.companies ?? [];
    if (scope.scopeType === "company") {
      return companies.find((company) => company.code === scope.scopeId);
    }
    const entity = scopeOptions?.entities.find((item) => item.id === scope.scopeId);
    const firstCompanyCode = entity?.companyCodes?.find((code) =>
      companies.some((company) => company.code === code),
    );
    return firstCompanyCode
      ? companies.find((company) => company.code === firstCompanyCode)
      : undefined;
  }, [scope.scopeId, scope.scopeType, scopeOptions]);

  const fiscalYearStartMonth = activeCompany?.fiscalYearStartMonth ?? 1;
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const datePreset = searchParams.get("datePreset");
  const relativeRange = searchParams.get("relativeRange");

  return useMemo(() => {
    const fiscalLabel = fiscalLensLabel(scope, fiscalYearStartMonth);

    if (relativeRange) {
      const label = RELATIVE_LABELS[relativeRange] ?? relativeRange;
      return {
        isFiscalLens: false,
        headerLabel: label,
        summarySubtitle: `${label} / ${fiscalLabel}`,
        currentLabel: "Range",
        priorLabel: "Prior range",
        comparisonLabel: "Relative range",
      };
    }

    if (dateFrom || dateTo) {
      const fromLabel = formatDateLabel(dateFrom);
      const toLabel = formatDateLabel(dateTo);
      const rangeLabel = dateFrom && dateTo
        ? `${fromLabel} - ${toLabel}`
        : dateFrom
          ? `From ${fromLabel}`
          : `Through ${toLabel}`;
      const coverage = fiscalCoverageLabel(dateFrom, dateTo, fiscalYearStartMonth);
      const presetLabel = datePreset ? (DATE_PRESET_LABELS[datePreset] ?? datePreset) : "Date range";

      return {
        isFiscalLens: false,
        headerLabel: rangeLabel,
        summarySubtitle: coverage ? `${rangeLabel} / ${coverage}` : rangeLabel,
        currentLabel: "Range",
        priorLabel: "Prior range",
        comparisonLabel: presetLabel,
      };
    }

    return {
      isFiscalLens: true,
      headerLabel: fiscalLabel,
      summarySubtitle: fiscalLabel,
      currentLabel: String(scope.fiscalYear),
      priorLabel: String(scope.fiscalYear - 1),
      comparisonLabel: scope.period == null ? "Full year" : "Fiscal period",
    };
  }, [dateFrom, datePreset, dateTo, fiscalYearStartMonth, relativeRange, scope]);
}
