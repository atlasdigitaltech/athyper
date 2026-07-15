import type { ViewDensity } from "./types";

export const runtimeTableChrome = {
  shell:          "min-h-0 min-w-full overflow-visible rounded-md border bg-background",
  scrollShell:    "min-h-0 overflow-auto rounded-md border bg-background",
  table:          "min-w-full caption-bottom divide-y divide-border text-sm",
  head:           "border-b bg-muted",
  body:           "divide-y divide-border bg-background",
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
  headerButton:   "flex items-center gap-1 transition-colors hover:text-foreground",
  sortIcon:       "size-3.5 opacity-40",
  activeSortIcon: "size-3.5 text-primary",
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
  footer:         "z-20 mt-2 flex shrink-0 flex-col gap-1 bg-background px-2.5 py-0.5 text-xs text-muted-foreground shadow-[0_-1px_0_hsl(var(--border))] md:flex-row md:items-center",
  footerButton:   "inline-flex h-7 items-center justify-center gap-1 rounded-md border bg-background px-2 text-xs font-medium leading-none text-foreground transition-colors hover:bg-muted",
  footerButtonPrimary:"inline-flex h-7 items-center justify-center gap-1 rounded-md border bg-foreground px-2 text-xs font-medium leading-none text-background transition-opacity hover:opacity-90",
  footerButtonDisabled:"inline-flex h-7 items-center justify-center gap-1 rounded-md border bg-background px-2 text-xs font-medium leading-none text-muted-foreground/55",
  footerPageLabel:"inline-flex h-7 items-center justify-center whitespace-nowrap px-1.5 text-xs leading-none text-muted-foreground",
  footerButtonIcon:"size-3 shrink-0",
} as const;

export const runtimeTableScrollStyle = {} as const;

export const runtimeStickyHeaderCellStyle = {
  position: "sticky",
  top:      0,
  zIndex:   20,
} as const;

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
