/** Published navigation is declarative; viewport size never selects task semantics. */
import { parseEntityRuntimeLocalizedText, type EntityRuntimeLocalizedTextV1 } from "./runtime-resource";
export interface EntityDetailNavigationV1 {
  readonly mode: "scroll" | "switch";
  readonly tabs?: readonly {
    readonly key: string;
    readonly label: string;
    readonly localizedLabel?: EntityRuntimeLocalizedTextV1;
    /** Semantic icon key; the runtime falls back when absent or unknown. */
    readonly iconKey?: string;
    readonly sectionKeys: readonly string[];
  }[];
}

export function parseEntityDetailNavigation(
  value: unknown,
  sectionKeys: readonly string[],
): EntityDetailNavigationV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid detail navigation");
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some((key) => !["mode", "tabs"].includes(key)) ||
    !["scroll", "switch"].includes(String(raw.mode))
  )
    throw new TypeError("Invalid detail navigation mode");
  if (raw.tabs === undefined)
    return { mode: raw.mode as EntityDetailNavigationV1["mode"] };
  if (!Array.isArray(raw.tabs) || !raw.tabs.length || raw.tabs.length > 12)
    throw new TypeError("Invalid detail navigation tabs");
  const keys = new Set<string>(),
    assigned = new Set<string>();
  const tabs = raw.tabs.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Invalid detail navigation tab");
    const tab = value as Record<string, unknown>;
    if (
      Object.keys(tab).some(
        (key) => !["key", "label", "localizedLabel", "iconKey", "sectionKeys"].includes(key),
      ) ||
      typeof tab.key !== "string" ||
      !/^[a-z][a-z0-9_.-]{0,126}$/.test(tab.key) ||
      keys.has(tab.key)
    )
      throw new TypeError("Invalid detail navigation tab key");
    keys.add(tab.key);
    if (
      typeof tab.label !== "string" ||
      !tab.label.trim() ||
      tab.label.length > 200 ||
      !Array.isArray(tab.sectionKeys) ||
      !tab.sectionKeys.length
    )
      throw new TypeError("Invalid detail navigation tab label or sections");
    if (tab.iconKey !== undefined && (typeof tab.iconKey !== "string" || !/^[a-z][a-z0-9-]{0,62}$/.test(tab.iconKey)))
      throw new TypeError("Invalid detail navigation tab icon");
    const references = tab.sectionKeys.map((key) => {
      if (
        typeof key !== "string" ||
        !sectionKeys.includes(key) ||
        assigned.has(key)
      )
        throw new TypeError("Unknown or ambiguous detail navigation section");
      assigned.add(key);
      return key;
    });
    return { key: tab.key, label: tab.label.trim(), ...(tab.localizedLabel === undefined ? {} : { localizedLabel: parseEntityRuntimeLocalizedText(tab.localizedLabel) }), ...(typeof tab.iconKey === "string" ? { iconKey: tab.iconKey } : {}), sectionKeys: references };
  });
  if (assigned.size !== sectionKeys.length)
    throw new TypeError("Detail navigation must cover every section");
  return { mode: raw.mode as EntityDetailNavigationV1["mode"], tabs };
}
