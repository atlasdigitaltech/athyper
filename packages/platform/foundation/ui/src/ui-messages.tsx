"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ChartType, ChartUnavailableCode } from "@athyper/contract-platform-chart";

/** Localized copy used by foundation controls. Product-specific content remains
 * with its owning surface; these are reusable control and accessibility labels. */
export interface UiMessages {
  readonly closePanel: string;
  readonly closeDialog: string;
  readonly drawerPanel: string;
  readonly notifications: string;
  readonly loading: string;
  readonly chooseDate: string;
  readonly loadingCalendar: string;
  readonly clearSearch: string;
  readonly selectedAndAvailable: (selected: number, available: number) => string;
  readonly companyAndLegalEntityCount: (companies: number, legalEntities: number) => string;
  readonly legalEntity: (code: string) => string;
  readonly companyDetails: (code: string, country: string, currency: string) => string;
  readonly noMatchingCompanies: string;
  readonly selectView: string;
  /** ChoiceSelect placeholder when no option is chosen. */
  readonly selectOption: string;
  readonly viewName: (name: string, modified: boolean) => string;
  /** Shared chart (`chart.*`): why a type is unavailable, at most `seriesLimit` series. */
  readonly chartUnavailable: (code: ChartUnavailableCode, seriesLimit: number) => string;
  readonly chartTypeName: (type: ChartType) => string;
  /** The one-line summary that follows the chart's caption. */
  readonly chartSummary: (typeName: string, categories: number, series: number) => string;
  /** A point's accessible name; `share` already formatted. */
  readonly chartPoint: (category: string, series: string, value: string, share?: string) => string;
  /** A share of a total (0–1) as a percentage. */
  readonly chartShare: (share: number) => string;
  readonly chartWithheldHeading: string;
  /** A withheld point in the consumer's words; the series is named when the chart has several. */
  readonly chartWithheld: (category: string, state: string, series?: string) => string;
  readonly chartTruncatedCategories: string;
  readonly chartTruncatedSeries: string;
  readonly chartShowDataTable: string;
  readonly chartHideDataTable: string;
  readonly chartTotal: string;
}

const chartUnavailableEnglish: Readonly<Record<ChartUnavailableCode, string>> = Object.freeze({
  CHART_NO_VALUES: "There are no values to chart.",
  CHART_UNORDERED: "A line needs a sequence, such as dates or periods.",
  CHART_SERIES_COUNT: "",
  CHART_NOT_PART_OF_WHOLE: "These values aren't parts of one total.",
  CHART_NEGATIVE: "A pie can't show negative values.",
  CHART_WITHHELD: "Some values are withheld, so shares can't be shown.",
  CHART_TOO_MANY_SLICES: "Too many values for a pie; choose a column chart.",
  CHART_TRUNCATED: "Only the first values are shown, so shares can't be shown.",
});
const chartTypeEnglish: Readonly<Record<ChartType, string>> = Object.freeze({
  column: "Column chart", bar: "Bar chart", line: "Line chart", groupedColumn: "Grouped column chart",
  stackedColumn: "Stacked column chart", pie: "Pie chart", donut: "Donut chart",
});

export const englishUiMessages: UiMessages = Object.freeze({
  closePanel: "Close panel", closeDialog: "Close dialog", drawerPanel: "Drawer panel",
  notifications: "Notifications", loading: "Loading", chooseDate: "Choose date",
  loadingCalendar: "Loading calendar…", clearSearch: "Clear search",
  selectedAndAvailable: (selected: number, available: number) => `${selected} selected · ${available} available`,
  companyAndLegalEntityCount: (companies: number, legalEntities: number) => `${companies} ${companies === 1 ? "company" : "companies"} · ${legalEntities} ${legalEntities === 1 ? "legal entity" : "legal entities"}`,
  legalEntity: (code: string) => `Legal entity · ${code}`,
  companyDetails: (code: string, country: string, currency: string) => `${code} · ${country} · ${currency}`,
  noMatchingCompanies: "No permitted companies match your search.",
  selectView: "Select view",
  selectOption: "Select an option",
  viewName: (name: string, modified: boolean) => `View: ${name}${modified ? " (modified)" : ""}`,
  chartUnavailable: (code: ChartUnavailableCode, seriesLimit: number) =>
    code === "CHART_SERIES_COUNT" ? (seriesLimit === 1 ? "Choose one column to chart." : `Choose between 2 and ${seriesLimit} columns to compare.`) : chartUnavailableEnglish[code],
  chartTypeName: (type: ChartType) => chartTypeEnglish[type],
  chartSummary: (typeName: string, categories: number, series: number) =>
    `${typeName}: ${categories} ${categories === 1 ? "category" : "categories"}, ${series} series.`,
  chartPoint: (category: string, series: string, value: string, share?: string) => `${category}, ${series}: ${value}${share ? `, ${share}` : ""}`,
  chartShare: (share: number) => new Intl.NumberFormat("en", { style: "percent" }).format(share),
  chartWithheldHeading: "Not charted",
  chartWithheld: (category: string, state: string, series?: string) => (series ? `${category}, ${series}: ${state}` : `${category}: ${state}`),
  chartTruncatedCategories: "Only the first categories are shown.",
  chartTruncatedSeries: "Only the first columns are shown.",
  chartShowDataTable: "Show data table",
  chartHideDataTable: "Hide data table",
  chartTotal: "Total",
});

const UiMessagesContext = createContext<UiMessages>(englishUiMessages);
export function UiMessagesProvider({ messages, children }: { readonly messages: UiMessages; readonly children: ReactNode }) { return <UiMessagesContext.Provider value={messages}>{children}</UiMessagesContext.Provider>; }
export function useUiMessages(): UiMessages { return useContext(UiMessagesContext); }
