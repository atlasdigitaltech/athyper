import { buttonVariants } from "@athyper/ui/primitives";
import { cn } from "@athyper/theme/utils";

export const entityHeaderShellClass = "overflow-hidden rounded-xl border border-border bg-card shadow-sm";
export const entityHeaderEditClass = "ring-1 ring-inset ring-primary/30";

export const headerHPaddingClass = "px-4 sm:px-5 lg:px-6";
export const headerIdentityPaddingClass = "py-3 pl-3 pr-4";

export const typeChipClass =
  "inline-flex h-10 shrink-0 items-center overflow-hidden rounded-lg border bg-background shadow-sm";

export const typeChipBackButtonClass =
  "flex h-full w-9 items-center justify-center border-r border-r-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const typeChipLabelClass =
  "flex h-full min-w-0 items-center px-3 text-base font-semibold leading-5 text-foreground transition-colors hover:text-primary hover:underline";

export const typeChipStaticLabelClass =
  "flex h-full min-w-0 items-center px-3 text-base font-semibold leading-5 text-foreground";

export const typeChipStandaloneClass =
  "inline-flex h-10 shrink-0 items-center rounded-lg border bg-background px-3 text-base font-semibold leading-5 text-foreground shadow-sm transition-colors hover:text-primary hover:underline";

export const typeChipStandaloneStaticClass =
  "inline-flex h-10 shrink-0 items-center rounded-lg border bg-background px-3 text-base font-semibold leading-5 text-foreground shadow-sm";

export const headerPrimaryActionClass = cn(
  buttonVariants({ variant: "primary", size: "compact" }),
  "bg-foreground text-background hover:bg-foreground/90 focus-visible:ring-ring/40",
);

export const headerDangerActionClass = cn(
  buttonVariants({ variant: "destructive", size: "compact" }),
  "hover:bg-destructive/90 focus-visible:ring-ring/40",
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

export const headerTabBarClass =
  "flex min-h-11 items-center gap-5 overflow-hidden border-t border-border bg-card px-4 sm:px-5 lg:px-6";

export const headerTabButtonClass =
  "relative h-11 shrink-0 whitespace-nowrap text-base font-medium transition-colors";

export const headerTabMoreButtonClass =
  "relative flex h-11 shrink-0 items-center gap-1 whitespace-nowrap text-base font-medium transition-colors";

export const headerTabCountBadgeClass =
  "ml-1.5 rounded bg-muted px-1 py-0.5 text-sm font-medium tabular-nums text-muted-foreground";
