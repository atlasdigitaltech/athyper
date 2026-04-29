/**
 * @athyper/icons — Color Token Registry
 *
 * Maps control.entity.color_token values to Tailwind icon classes.
 * These classes must be written as complete strings (no interpolation)
 * so Tailwind's class scanner can detect them at build time.
 *
 * color_token is a semantic palette name seeded per entity (e.g. "orange",
 * "violet", "teal"). The icon classes here apply to workspace launcher cards
 * and any surface that renders entity identity chips with a colored icon.
 */

export interface EntityColorClasses {
  /** Text color class for the icon itself. */
  iconClass: string;
  /** Background class for the icon container. */
  iconBgClass: string;
}

const COLOR_TOKEN_MAP: Record<string, EntityColorClasses> = {
  orange:  { iconClass: "text-orange-500",  iconBgClass: "bg-orange-500/10" },
  amber:   { iconClass: "text-amber-500",   iconBgClass: "bg-amber-500/10" },
  yellow:  { iconClass: "text-yellow-500",  iconBgClass: "bg-yellow-500/10" },
  lime:    { iconClass: "text-lime-500",    iconBgClass: "bg-lime-500/10" },
  green:   { iconClass: "text-green-500",   iconBgClass: "bg-green-500/10" },
  emerald: { iconClass: "text-emerald-500", iconBgClass: "bg-emerald-500/10" },
  teal:    { iconClass: "text-teal-500",    iconBgClass: "bg-teal-500/10" },
  cyan:    { iconClass: "text-cyan-500",    iconBgClass: "bg-cyan-500/10" },
  sky:     { iconClass: "text-sky-500",     iconBgClass: "bg-sky-500/10" },
  blue:    { iconClass: "text-blue-500",    iconBgClass: "bg-blue-500/10" },
  indigo:  { iconClass: "text-indigo-500",  iconBgClass: "bg-indigo-500/10" },
  violet:  { iconClass: "text-violet-500",  iconBgClass: "bg-violet-500/10" },
  purple:  { iconClass: "text-purple-500",  iconBgClass: "bg-purple-500/10" },
  pink:    { iconClass: "text-pink-500",    iconBgClass: "bg-pink-500/10" },
  rose:    { iconClass: "text-rose-500",    iconBgClass: "bg-rose-500/10" },
  red:     { iconClass: "text-red-500",     iconBgClass: "bg-red-500/10" },
  slate:   { iconClass: "text-slate-500",   iconBgClass: "bg-slate-500/10" },
  gray:    { iconClass: "text-gray-500",    iconBgClass: "bg-gray-500/10" },
  zinc:    { iconClass: "text-zinc-500",    iconBgClass: "bg-zinc-500/10" },
  stone:   { iconClass: "text-stone-500",   iconBgClass: "bg-stone-500/10" },
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
