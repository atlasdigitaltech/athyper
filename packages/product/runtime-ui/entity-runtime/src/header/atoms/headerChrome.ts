import { buttonVariants } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

// ── Shell ─────────────────────────────────────────────────────────────────────

export const entityHeaderShellClass = "overflow-hidden rounded-xl border border-border bg-card shadow-sm";

export const entityHeaderEditClass = "ring-1 ring-inset ring-primary/30";

// ── Horizontal padding shared across identity bar + tab bar ───────────────────

export const headerHPaddingClass = "px-4 sm:px-5 lg:px-[22px]";
export const headerIdentityPaddingClass = "px-4 py-3 sm:px-5 lg:px-[22px]";

// ── Type chip ─────────────────────────────────────────────────────────────────

export const typeChipClass =
  "inline-flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border bg-foreground text-background shadow-sm";

export const typeChipBackButtonClass =
  "flex h-full w-6 items-center justify-center border-r border-r-ring bg-inherit text-inherit transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-background";

export const typeChipLabelClass =
  "flex h-full min-w-0 items-center bg-inherit px-2.5 text-sm font-medium text-inherit transition-opacity hover:opacity-85";

export const typeChipStaticLabelClass =
  "flex h-full min-w-0 items-center bg-inherit px-2.5 text-sm font-medium text-inherit";

export const typeChipStandaloneClass =
  "inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-foreground px-2.5 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/85";

export const typeChipStandaloneStaticClass =
  "inline-flex h-8 shrink-0 items-center rounded-md border border-border bg-foreground px-2.5 text-sm font-medium text-background shadow-sm";

// ── Action buttons ────────────────────────────────────────────────────────────

export const headerPrimaryActionClass = cn(
  buttonVariants({ variant: "primary", size: "compact" }),
  "bg-foreground text-background hover:opacity-85 focus-visible:ring-ring/40",
);

export const headerDangerActionClass = cn(
  buttonVariants({ variant: "destructive", size: "compact" }),
  "hover:opacity-90 focus-visible:ring-ring/40",
);

export const headerSecondaryActionClass = cn(
  buttonVariants({ variant: "outline", size: "compact" }),
  "border-border text-muted-foreground shadow-sm hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring/40",
);

export const headerIconButtonClass = cn(
  buttonVariants({ variant: "outline", size: "iconCompact" }),
  "shrink-0 border-border text-muted-foreground shadow-sm hover:bg-muted/60 hover:text-foreground focus-visible:ring-ring/40",
);

export const platformIconButtonClass = cn(
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
);

export const headerIconButtonActiveClass =
  "border border-primary/30 bg-primary/10 text-primary shadow-sm";

// ── Tab bar ───────────────────────────────────────────────────────────────────

export const headerTabBarClass =
  "flex min-h-11 items-center gap-5 overflow-hidden border-t border-border bg-card px-4 sm:px-5 lg:px-[22px]";

export const headerTabButtonClass =
  "relative h-11 shrink-0 whitespace-nowrap text-sm font-medium transition-colors";

export const headerTabMoreButtonClass =
  "relative flex h-11 shrink-0 items-center gap-1 whitespace-nowrap text-sm font-medium transition-colors";

export const headerTabCountBadgeClass =
  "ml-1.5 rounded bg-muted px-1 py-0.5 text-sm font-medium tabular-nums text-muted-foreground";
