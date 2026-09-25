/** Shared syntax for presentation coordinates. Navigation retains the legacy 360 key. */
export const ENTITY_RUNTIME_KEY_PATTERN = "^[A-Za-z][A-Za-z0-9_.-]{0,126}$";
const keyPattern = new RegExp(ENTITY_RUNTIME_KEY_PATTERN);
export function isEntityRuntimeKey(value: unknown): value is string {
  return typeof value === "string" && keyPattern.test(value);
}
export function isEntityNavigationKey(value: unknown): value is string {
  return value === "360" || isEntityRuntimeKey(value);
}
export function isEntityRuntimeUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}
export type EntityStatusTone = "neutral" | "success" | "warning" | "danger";
export function entityStatusTone(value: unknown): EntityStatusTone {
  return value === "success" || value === "warning" || value === "danger" ? value : "neutral";
}
/** Tone vocabulary belongs to the entity's compiled surface, not shared chrome. */
export function resolveEntityStatusTone(status: unknown, tones: unknown): EntityStatusTone {
  if (typeof status !== "string" || !tones || typeof tones !== "object" || Array.isArray(tones)) return "neutral";
  const key = status.toLowerCase();
  return Object.hasOwn(tones, key) ? entityStatusTone((tones as Record<string, unknown>)[key]) : "neutral";
}

/** Normalize legacy published providers at the boundary; tab keys remain unchanged. */
export function entityNavigationProvider(value: unknown): "overview" | "section" | undefined {
  if (value === "360" || value === "overview") return "overview";
  return value === "section" ? "section" : undefined;
}

/** Legacy provider defaults are resolved at the metadata boundary, never by the renderer. */
export function entitySectionDisplay(value: unknown, provider: unknown): "continuous" | "selected" {
  if (value === "continuous" || value === "selected") return value;
  if (value !== undefined) throw new TypeError("ENTITY_SECTION_DISPLAY_INVALID");
  return entityNavigationProvider(provider) === "overview" ? "continuous" : "selected";
}
