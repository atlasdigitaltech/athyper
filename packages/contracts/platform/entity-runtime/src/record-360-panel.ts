/** Declarative composition only. Data and permissions belong to registered providers. */
export interface EntityRecord360PanelV1 {
  readonly schemaVersion: 1;
  readonly kind: "360";
  readonly sections: readonly string[];
  readonly tabs: readonly {
    readonly key: string;
    readonly label: string;
    readonly provider: "360" | "section";
    readonly sectionKey?: string;
  }[];
  readonly sidebar: readonly {
    readonly key: string;
    readonly label: string;
    readonly provider: "primary-contact" | "primary-address";
  }[];
}

export function parseRecord360Panel(value: unknown): EntityRecord360PanelV1 {
  const object = (value: unknown): Record<string, unknown> => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new TypeError("Invalid 360 panel object");
    return value as Record<string, unknown>;
  };
  const text = (value: unknown): string => {
    if (typeof value !== "string" || !value.trim() || value.length > 200)
      throw new TypeError("Invalid 360 panel label");
    return value.trim();
  };
  const key = (value: unknown): string => {
    const result = text(value);
    if (result !== "360" && !/^[a-z][a-z0-9_.-]{0,126}$/.test(result))
      throw new TypeError("Invalid 360 provider reference");
    return result;
  };
  const list = (value: unknown, limit: number): unknown[] => {
    if (!Array.isArray(value) || value.length > limit)
      throw new TypeError("Invalid 360 panel list");
    return value;
  };
  const raw = object(value);
  if (raw.schemaVersion !== 1 || raw.kind !== "360")
    throw new TypeError("Invalid 360 panel version or kind");
  const sections = list(raw.sections, 64).map(key);
  const tabs = list(raw.tabs, 12).map((value) => {
    const tab = object(value);
    if (tab.provider !== "360" && tab.provider !== "section")
      throw new TypeError("Unregistered 360 tab provider");
    if (tab.provider === "360" && tab.sectionKey !== undefined)
      throw new TypeError("360 tab cannot bind a single section");
    return {
      key: key(tab.key),
      label: text(tab.label),
      provider: tab.provider,
      ...(tab.provider === "section"
        ? { sectionKey: key(tab.sectionKey) }
        : {}),
    };
  });
  const sidebar = list(raw.sidebar, 2).map((value) => {
    const item = object(value);
    if (
      item.provider !== "primary-contact" &&
      item.provider !== "primary-address"
    )
      throw new TypeError("Unregistered 360 sidebar provider");
    return {
      key: key(item.key),
      label: text(item.label),
      provider: item.provider,
    };
  });
  for (const values of [
    sections,
    tabs.map((tab) => tab.key),
    tabs.flatMap((tab) => (tab.sectionKey ? [tab.sectionKey] : [])),
    sidebar.map((item) => item.key),
    sidebar.map((item) => item.provider),
  ]) {
    if (new Set(values).size !== values.length)
      throw new TypeError("Duplicate 360 panel reference");
  }
  if (
    tabs.filter((tab) => tab.provider === "360").length !== 1 ||
    !sections.length
  )
    throw new TypeError("360 panel requires one overview tab and sections");
  if (tabs.some((tab) => tab.sectionKey && sections.includes(tab.sectionKey)))
    throw new TypeError(
      "A section cannot appear in both the rail and a separate tab",
    );
  return {
    schemaVersion: 1,
    kind: "360",
    sections,
    tabs,
    sidebar,
  } as EntityRecord360PanelV1;
}
