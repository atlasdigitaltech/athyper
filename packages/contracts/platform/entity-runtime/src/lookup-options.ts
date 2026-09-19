import { parseRecentChoicePolicy, type RecentChoicePolicy } from "./recent-choice";
/** Surface-local directory behavior. These settings never grant server permissions. */
export interface EntityLookupOptions {
  readonly mode: "browse" | "choose";
  readonly selectionMode: "none" | "single" | "multiple";
  readonly recordAccess: "readOnly" | "manage";
  readonly presentation: {
    readonly viewType: "compact" | "full";
    readonly fullViewHost: "inline" | "dialog";
  };
  readonly creation: {
    readonly showIn: readonly ("compact" | "full")[];
    readonly actionKey?: string;
    readonly label?: string;
  };
  readonly display: {
    readonly settingsShowIn: readonly ("compact" | "full")[];
    readonly defaults: {
      readonly layout: "table" | "compact";
      readonly density: "compact" | "comfortable" | "spacious";
      readonly searchBehavior: "instant" | "submit";
    };
    readonly userOverrides: readonly (
      "layout" | "density" | "searchBehavior"
    )[];
    readonly preferenceScope: "surface" | "application";
  };
  readonly views: {
    readonly defaultViewKey: string;
    readonly allowedViewKeys?: readonly string[];
    readonly allowSwitching: boolean;
    readonly usePersonalDefault: boolean;
  };
  readonly recent: RecentChoicePolicy;
}
const record = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw Error("Invalid lookup configuration");
  return v as Record<string, unknown>;
};
const value = <T extends string>(
  v: unknown,
  values: readonly T[],
  fallback: T,
): T => {
  if (v === undefined) return fallback;
  if (!values.includes(v as T)) throw Error("Unsupported lookup option");
  return v as T;
};
const flag = (v: unknown, fallback: boolean) => {
  if (v === undefined) return fallback;
  if (typeof v !== "boolean") throw Error("Invalid lookup flag");
  return v;
};
const name = (v: unknown, fallback?: string) => {
  if (v === undefined && fallback !== undefined) return fallback;
  if (typeof v !== "string" || !v.trim() || v.length > 128)
    throw Error("Invalid lookup key");
  return v;
};
const list = <T extends string>(
  v: unknown,
  values: readonly T[],
  fallback: readonly T[],
): readonly T[] => {
  if (v === undefined) return fallback;
  if (
    !Array.isArray(v) ||
    v.length > values.length ||
    new Set(v).size !== v.length
  )
    throw Error("Invalid lookup option list");
  return v.map((x) => value(x, values, values[0]!));
};
export function parseEntityLookupOptions(raw: unknown): EntityLookupOptions {
  const o = record(raw),
    p = record(o.presentation ?? {}),
    c = record(o.creation ?? {}),
    d = record(o.display ?? {}),
    defaults = record(d.defaults ?? {}),
    v = record(o.views ?? {}),
    r = record(o.recent ?? {});
  const only = (
    object: Record<string, unknown>,
    allowed: readonly string[],
  ) => {
    if (Object.keys(object).some((key) => !allowed.includes(key)))
      throw Error("Unsupported lookup configuration property");
  };
  only(p, ["viewType", "fullViewHost"]);
  only(c, ["showIn", "actionKey", "label"]);
  only(d, ["settingsShowIn", "defaults", "userOverrides", "preferenceScope"]);
  only(defaults, ["layout", "density", "searchBehavior"]);
  only(v, [
    "defaultViewKey",
    "allowedViewKeys",
    "allowSwitching",
    "usePersonalDefault",
  ]);
  only(r, ["enabled", "limit", "persistence", "scope", "retentionDays"]);
  const mode = value(o.mode, ["browse", "choose"], "choose"),
    selectionMode = value(
      o.selectionMode,
      ["none", "single", "multiple"],
      mode === "choose" ? "single" : "none",
    ),
    recordAccess = value(o.recordAccess, ["readOnly", "manage"], "readOnly");
  if (
    mode === "browse"
      ? selectionMode !== "none"
      : selectionMode === "none" || recordAccess !== "readOnly"
  )
    throw Error("Incompatible lookup mode, selection, and record access");
  const showIn = list(c.showIn, ["compact", "full"], []);
  if (showIn.length && (!c.actionKey || !c.label))
    throw Error("Lookup creation requires a registered action and label");
  const allowed =
    v.allowedViewKeys === undefined
      ? undefined
      : (() => {
          if (
            !Array.isArray(v.allowedViewKeys) ||
            !v.allowedViewKeys.length ||
            v.allowedViewKeys.length > 100
          )
            throw Error("Invalid allowed lookup views");
          return v.allowedViewKeys.map((x) => name(x));
        })();
  const defaultViewKey = name(v.defaultViewKey, "system");
  if (allowed && !allowed.includes(defaultViewKey))
    throw Error("Default lookup view must be allowed");
  const limit = r.limit ?? 5;
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 20)
    throw Error("Invalid recent lookup limit");
  return {
    mode,
    selectionMode,
    recordAccess,
    presentation: {
      viewType: value(p.viewType, ["compact", "full"], "compact"),
      fullViewHost: value(p.fullViewHost, ["inline", "dialog"], "dialog"),
    },
    creation: {
      showIn,
      ...(c.actionKey
        ? { actionKey: name(c.actionKey), label: name(c.label) }
        : {}),
    },
    display: {
      settingsShowIn: list(d.settingsShowIn, ["compact", "full"], ["full"]),
      defaults: {
        layout: value(defaults.layout, ["table", "compact"], "table"),
        density: value(
          defaults.density,
          ["compact", "comfortable", "spacious"],
          "compact",
        ),
        searchBehavior: value(
          defaults.searchBehavior,
          ["instant", "submit"],
          "instant",
        ),
      },
      userOverrides: list(
        d.userOverrides,
        ["layout", "density", "searchBehavior"],
        ["layout", "density", "searchBehavior"],
      ),
      preferenceScope: value(
        d.preferenceScope,
        ["surface", "application"],
        "surface",
      ),
    },
    views: {
      defaultViewKey,
      ...(allowed ? { allowedViewKeys: allowed } : {}),
      allowSwitching: flag(v.allowSwitching, true),
      usePersonalDefault: flag(v.usePersonalDefault, false),
    },
    recent: parseRecentChoicePolicy({ ...r, enabled: flag(r.enabled, false), limit: Number(limit) }),
  };
}
