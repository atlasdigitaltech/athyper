import {
  parseEntityLookupOptions,
  type EntityLookupOptions,
} from "./lookup-options";
import { parseIntakeCondition, type IntakeCondition } from "./intake";
export interface EntityLookupField {
  readonly key: string;
  readonly control: "entityLookup";
  readonly label: string;
  readonly helpText?: string;
  readonly required: false;
  readonly visibleWhen?: IntakeCondition;
  readonly lookup: EntityLookupOptions & {
    readonly messages?: {
      readonly emptyTitle?: string;
      readonly emptyDescription?: string;
      readonly noMatchesTitle?: string;
      readonly noMatchesDescription?: string;
      readonly selectMultiple?: string;
    };
    readonly targetEntity: string;
    readonly adapterKey: string;
    readonly searchLabel: string;
    readonly emptyMessage: string;
    readonly resultsMessage: string;
    readonly moreMessage: string;
    readonly result: {
      readonly titleFields: readonly string[];
      readonly detailFields: readonly string[];
    };
    readonly actions: readonly {
      readonly key: string;
      readonly kind: "select" | "create" | "view";
      readonly label: string;
      readonly visibleWhen?: IntakeCondition;
    }[];
  };
}
const fail = (name: string): never => {
  throw new TypeError(`Invalid entity lookup: ${name}`);
};
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail("object");
const text = (v: unknown): string =>
  typeof v === "string" && v.trim() && v.length <= 4000 ? v : fail("text");
const key = (v: unknown): string =>
  /^[a-z][a-z0-9_.-]{0,126}$/.test(text(v)) &&
  !["constructor", "prototype", "__proto__"].includes(String(v))
    ? String(v)
    : fail("key");
const only = (v: Record<string, unknown>, keys: string[]) => {
  if (Object.keys(v).some((k) => !keys.includes(k)))
    fail("unsupported property");
};
export function parseEntityLookupField(raw: unknown): EntityLookupField {
  const f = obj(raw),
    l = obj(f.lookup),
    r = obj(l.result);
  if (f.control !== "entityLookup" || f.required !== false)
    fail("lookup is an action control, not a persisted required answer");
  only(l, [
    "messages",
    "targetEntity",
    "adapterKey",
    "searchLabel",
    "emptyMessage",
    "resultsMessage",
    "moreMessage",
    "result",
    "actions",
    "mode",
    "selectionMode",
    "recordAccess",
    "presentation",
    "creation",
    "display",
    "views",
    "recent",
  ]);
  only(r, ["titleFields", "detailFields"]);
  const messages = l.messages === undefined ? undefined : obj(l.messages);
  if (messages) {
    only(messages, [
      "emptyTitle",
      "emptyDescription",
      "noMatchesTitle",
      "noMatchesDescription",
      "selectMultiple",
    ]);
    for (const value of Object.values(messages)) text(value);
  }
  const keys = (v: unknown, allowEmpty = false) => {
    if (!Array.isArray(v) || v.length > 8 || (!allowEmpty && !v.length))
      fail("result fields");
    const list = (v as unknown[]).map(key);
    if (new Set(list).size !== list.length) fail("duplicate result field");
    return list;
  };
  if (!Array.isArray(l.actions) || l.actions.length > 8) fail("actions");
  const actions = (l.actions as unknown[]).map((raw) => {
    const a = obj(raw);
    only(a, ["key", "kind", "label", "visibleWhen"]);
    if (!["select", "create", "view"].includes(String(a.kind)))
      fail("action kind");
    return {
      key: key(a.key),
      kind: a.kind as "select" | "create" | "view",
      label: text(a.label),
      ...(a.visibleWhen === undefined
        ? {}
        : { visibleWhen: parseIntakeCondition(a.visibleWhen) }),
    };
  });
  if (new Set(actions.map((a) => a.key)).size !== actions.length)
    fail("duplicate action");
  return {
    key: key(f.key),
    control: "entityLookup",
    label: text(f.label),
    ...(f.helpText === undefined ? {} : { helpText: text(f.helpText) }),
    required: false,
    ...(f.visibleWhen === undefined
      ? {}
      : { visibleWhen: parseIntakeCondition(f.visibleWhen) }),
    lookup: {
      ...parseEntityLookupOptions(l),
      ...(messages
        ? {
            messages: messages as NonNullable<
              EntityLookupField["lookup"]["messages"]
            >,
          }
        : {}),
      targetEntity: key(l.targetEntity),
      adapterKey: key(l.adapterKey),
      searchLabel: text(l.searchLabel),
      emptyMessage: text(l.emptyMessage),
      resultsMessage: text(l.resultsMessage),
      moreMessage: text(l.moreMessage),
      result: {
        titleFields: keys(r.titleFields),
        detailFields: keys(r.detailFields ?? [], true),
      },
      actions,
    },
  };
}
