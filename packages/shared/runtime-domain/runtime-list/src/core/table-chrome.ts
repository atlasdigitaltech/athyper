import type { ViewDensity, ViewMode } from "./types";

export const runtimeTableChrome = {
  viewport:       "w-full min-w-0 [container-type:inline-size]",
  contentContained:"flex w-full min-w-0 flex-col",
  contentListResponsive:"flex w-full min-w-0 flex-col md:w-max md:min-w-full",
  contentWide:    "flex w-max min-w-full flex-col",
  shell:          "min-h-0 w-full min-w-0 overflow-visible rounded-md border bg-card",
  scrollShell:    "min-h-0 overflow-auto rounded-md border bg-card",
  table:          "min-w-full caption-bottom divide-y divide-border text-sm",
  head:           "sticky top-0 z-30 border-b bg-muted",
  body:           "divide-y divide-border bg-card",
  row:            "group transition-colors hover:bg-muted/40",
  groupRow:       "bg-muted/50",
  groupHeaderCell:"px-2.5 py-2 text-left align-middle text-sm font-medium text-foreground",
  groupCount:     "ml-2 text-xs text-muted-foreground",
  clickableRow:   "cursor-pointer",
  selectedRow:    "bg-muted/60",
  selectedRowSoft:"bg-primary/10",
  headerCell:     "sticky top-0 z-20 whitespace-nowrap bg-muted px-2.5 py-2 text-left align-middle text-sm font-medium text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
  selectHeaderCell:"sticky top-0 z-20 w-8 bg-muted px-2 py-2 align-middle shadow-[inset_0_-1px_0_hsl(var(--border))]",
  favoriteHeaderCell:"sticky top-0 z-20 w-8 bg-muted px-1.5 py-2 text-center align-middle shadow-[inset_0_-1px_0_hsl(var(--border))]",
  metaHeaderCell:   "sticky top-0 z-20 bg-muted px-2 py-2 text-right align-middle shadow-[inset_0_-1px_0_hsl(var(--border))]",
  headerContent:  "group/header flex min-w-0 items-center gap-0.5",
  headerButton:   "group flex min-w-0 items-center gap-1 transition-colors hover:text-foreground",
  sortIcon:       "size-3.5 shrink-0 opacity-0 transition-opacity duration-150 group-hover:opacity-40 group-focus-visible:opacity-60 motion-reduce:transition-none",
  activeSortIcon: "size-3.5 shrink-0 text-primary",
  cell:           "max-w-72 whitespace-nowrap px-2.5 align-middle",
  selectCell:     "w-8 px-2 align-middle",
  favoriteCell:   "w-8 px-1 text-center align-middle",
  metaCell:       "px-2 align-middle",
  identityCell:   "block truncate text-sm font-medium underline-offset-4 group-hover:underline",
  valueCell:      "block truncate text-sm",
  statusCell:     "inline-flex items-center gap-2 truncate text-sm",
  statusDot:      "h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/70",
  emptyCell:      "px-3 py-8 text-center text-xs text-muted-foreground",
  mutedValue:     "text-muted-foreground/50",
  checkbox:       "size-4 rounded border-input",
  shellWithFooter:"md:rounded-b-none",
  footer:         "z-20 flex shrink-0 flex-col gap-2.5 px-3 py-2.5 text-xs text-muted-foreground md:min-h-12 md:flex-row md:items-center md:gap-3 md:px-3.5 md:py-2",
  footerAttached: "sticky left-0 mt-2 w-[100cqw] rounded-md border bg-card shadow-sm md:bottom-0 md:z-30 md:-mt-px md:rounded-t-none md:bg-card/95 md:backdrop-blur",
  footerDetached: "relative mt-2 w-full rounded-md border bg-card shadow-sm",
  footerButton:   "inline-flex h-7 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-sm font-medium leading-5 text-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
  footerButtonPrimary:"inline-flex h-7 items-center justify-center gap-1 rounded-md bg-primary px-2 text-sm font-medium leading-5 text-primary-foreground shadow-sm transition-opacity hover:opacity-90",
  footerButtonDisabled:"inline-flex h-7 items-center justify-center gap-1 rounded-md border border-input bg-background px-2 text-sm font-medium leading-5 text-muted-foreground/55",
  footerPageLabel:"inline-flex h-7 items-center justify-self-center whitespace-nowrap px-1.5 text-sm leading-5 text-muted-foreground",
  footerButtonIcon:"size-3.5 shrink-0",
} as const;

export const runtimeTableScrollStyle = {} as const;

export const runtimeStickyHeaderCellStyle = {
  position: "sticky",
  top:      0,
  zIndex:   20,
} as const;

export function runtimeTableContentClassName(viewMode: ViewMode): string {
  if (viewMode === "compact") return runtimeTableChrome.contentContained;
  if (viewMode === "list") return runtimeTableChrome.contentListResponsive;
  return runtimeTableChrome.contentWide;
}

export function runtimeTableCellPadding(density: ViewDensity): string {
  if (density === "compact") return "py-1.5";
  if (density === "spacious") return "py-3";
  return "py-2.5";
}

export function runtimeExcelCellDensity(density: ViewDensity): string {
  if (density === "compact") return "px-2 py-0.5";
  if (density === "spacious") return "px-3 py-2";
  return "px-2.5 py-1";
}

export function runtimeCompactCardDensity(density: ViewDensity): {
  shellGap: string;
  card: string;
  title: string;
  subtitle: string;
  detailGrid: string;
  detailBox: string;
  detailLabel: string;
  detailValue: string;
  detailLimit: number;
} {
  if (density === "compact") {
    return {
      shellGap:    "gap-1.5",
      card:        "px-2.5 py-2",
      title:       "text-sm font-medium",
      subtitle:    "text-xs",
      detailGrid:  "mt-2 flex flex-wrap items-center gap-x-5 gap-y-1",
      detailBox:   "inline-flex min-w-0 max-w-full items-baseline gap-1.5",
      detailLabel: "text-sm font-medium",
      detailValue: "text-sm",
      detailLimit: 2,
    };
  }

  if (density === "spacious") {
    return {
      shellGap:    "gap-3",
      card:        "px-4 py-3.5",
      title:       "text-sm font-medium",
      subtitle:    "text-xs",
      detailGrid:  "mt-3 flex flex-wrap items-center gap-x-7 gap-y-2",
      detailBox:   "inline-flex min-w-0 max-w-full items-baseline gap-2",
      detailLabel: "text-sm font-medium",
      detailValue: "text-sm",
      detailLimit: 6,
    };
  }

  return {
    shellGap:    "gap-2",
    card:        "px-3 py-2.5",
    title:       "text-sm font-medium",
    subtitle:    "text-xs",
    detailGrid:  "mt-2.5 flex flex-wrap items-center gap-x-6 gap-y-1.5",
    detailBox:   "inline-flex min-w-0 max-w-full items-baseline gap-2",
    detailLabel: "text-sm font-medium",
    detailValue: "text-sm",
    detailLimit: 4,
  };
}
