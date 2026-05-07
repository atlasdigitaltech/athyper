/**
 * @athyper/icons — Color Token Registry
 *
 * Maps control.entity.color_token values to CSS-variable Tailwind icon classes.
 * These classes must be written as complete strings (no interpolation)
 * so Tailwind's class scanner can detect them at build time.
 *
 * color_token is a semantic palette name seeded per entity (e.g. "orange",
 * "violet", "teal"). The resolved classes stay theme-aware by using the
 * platform semantic and categorical color variables.
 */

export interface EntityColorClasses {
  /** Text color class for the icon itself. */
  iconClass: string;
  /** Background class for the icon container. */
  iconBgClass: string;
}

const COLOR_TOKEN_MAP: Record<string, EntityColorClasses> = {
  orange:  { iconClass: "text-warning",       iconBgClass: "bg-warning/10" },
  amber:   { iconClass: "text-warning",       iconBgClass: "bg-warning/10" },
  yellow:  { iconClass: "text-warning",       iconBgClass: "bg-warning/10" },
  lime:    { iconClass: "text-success",       iconBgClass: "bg-success/10" },
  green:   { iconClass: "text-success",       iconBgClass: "bg-success/10" },
  emerald: { iconClass: "text-success",       iconBgClass: "bg-success/10" },
  teal:    { iconClass: "text-categorical-2", iconBgClass: "bg-categorical-2/10" },
  cyan:    { iconClass: "text-info",          iconBgClass: "bg-info/10" },
  sky:     { iconClass: "text-info",          iconBgClass: "bg-info/10" },
  blue:    { iconClass: "text-info",          iconBgClass: "bg-info/10" },
  indigo:  { iconClass: "text-primary",       iconBgClass: "bg-primary/10" },
  violet:  { iconClass: "text-primary",       iconBgClass: "bg-primary/10" },
  purple:  { iconClass: "text-categorical-4", iconBgClass: "bg-categorical-4/10" },
  pink:    { iconClass: "text-categorical-5", iconBgClass: "bg-categorical-5/10" },
  rose:    { iconClass: "text-categorical-5", iconBgClass: "bg-categorical-5/10" },
  red:     { iconClass: "text-destructive",   iconBgClass: "bg-destructive/10" },
  slate:   { iconClass: "text-muted-foreground", iconBgClass: "bg-muted" },
  gray:    { iconClass: "text-muted-foreground", iconBgClass: "bg-muted" },
  zinc:    { iconClass: "text-muted-foreground", iconBgClass: "bg-muted" },
  stone:   { iconClass: "text-muted-foreground", iconBgClass: "bg-muted" },
};

const FALLBACK_COLORS: EntityColorClasses = {
  iconClass: "text-muted-foreground",
  iconBgClass: "bg-muted",
};

/**
 * Resolve a color_token string to Tailwind icon/bg classes.
 *
 * @param colorToken - value of control.entity.color_token (e.g. "orange")
 * @returns EntityColorClasses — falls back to muted if token is unrecognised
 */
export function getEntityColorClasses(colorToken: string): EntityColorClasses {
  return COLOR_TOKEN_MAP[colorToken] ?? FALLBACK_COLORS;
}
