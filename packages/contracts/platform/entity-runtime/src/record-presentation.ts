import {
  parseRecord360Panel,
  type EntityRecord360PanelV1,
} from "./record-360-panel";
/** Published record presentation contains field and operation references, never executable UI. */
export type RecordBadgeTone = "neutral" | "success" | "warning" | "danger";
export interface EntityRecordPresentationV1 {
  readonly schemaVersion: 1;
  readonly panel?: EntityRecord360PanelV1;
  readonly iconKey?: string;
  readonly titleField: string;
  readonly codeField?: string;
  readonly subtitleFields: readonly string[];
  readonly contextFields: readonly string[];
  readonly badges: readonly {
    readonly field: string;
    readonly label?: string;
    readonly tones: Readonly<Record<string, RecordBadgeTone>>;
  }[];
  readonly sections: readonly {
    readonly key: string;
    readonly label: string;
    readonly fields: readonly string[];
    readonly placement: "direct" | "overflow";
  }[];
  readonly actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly operationKey: string;
    readonly placement: "primary" | "secondary" | "overflow";
  }[];
}
export interface EntityRecordHeaderV1 {
  readonly panel?: EntityRecord360PanelV1;
  readonly title: string;
  readonly entityLabel: string;
  readonly iconKey?: string;
  readonly code?: string;
  readonly description?: string;
  readonly badges: readonly {
    readonly label: string;
    readonly tone: RecordBadgeTone;
  }[];
  readonly context: readonly {
    readonly key: string;
    readonly label: string;
    readonly value: string;
  }[];
  readonly actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly href?: string;
    readonly placement: "primary" | "secondary" | "overflow";
    readonly disabledReason?: string;
  }[];
  readonly sections: readonly {
    readonly key: string;
    readonly label: string;
    readonly placement: "direct" | "overflow";
    readonly count?: number;
  }[];
  readonly readOnly?: boolean;
}
const key = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value))
    throw new TypeError("Invalid record presentation reference");
  return value;
};
const text = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 200)
    throw new TypeError("Invalid record presentation label");
  return value.trim();
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid record presentation object");
  return value as Record<string, unknown>;
};
const list = (value: unknown): readonly unknown[] => {
  if (!Array.isArray(value) || value.length > 64)
    throw new TypeError("Invalid record presentation list");
  return value;
};
function choice<T extends string>(value: unknown, choices: readonly T[]): T {
  if (!choices.includes(value as T))
    throw new TypeError("Invalid record presentation choice");
  return value as T;
}
function unique(values: readonly string[]) {
  if (new Set(values).size !== values.length)
    throw new TypeError("Duplicate record presentation reference");
}
export function parseEntityRecordPresentation(
  value: unknown,
): EntityRecordPresentationV1 {
  const raw = object(value);
  if (raw.schemaVersion !== 1)
    throw new TypeError("Invalid record presentation version");
  const result: EntityRecordPresentationV1 = {
    schemaVersion: 1,
    ...(raw.panel === undefined
      ? {}
      : { panel: parseRecord360Panel(raw.panel) }),
    titleField: key(raw.titleField),
    ...(raw.iconKey === undefined ? {} : { iconKey: key(raw.iconKey) }),
    ...(raw.codeField === undefined ? {} : { codeField: key(raw.codeField) }),
    subtitleFields: list(raw.subtitleFields ?? []).map(key),
    contextFields: list(raw.contextFields ?? []).map(key),
    badges: list(raw.badges ?? []).map((value) => {
      const item = object(value);
      return {
        field: key(item.field),
        ...(item.label === undefined ? {} : { label: text(item.label) }),
        tones: Object.fromEntries(
          Object.entries(object(item.tones ?? {})).map(([state, tone]) => [
            key(state),
            choice(tone, ["neutral", "success", "warning", "danger"] as const),
          ]),
        ),
      };
    }),
    sections: list(raw.sections ?? []).map((value) => {
      const item = object(value);
      return {
        key: key(item.key),
        label: text(item.label),
        fields: list(item.fields ?? []).map(key),
        placement: choice(item.placement ?? "direct", [
          "direct",
          "overflow",
        ] as const),
      };
    }),
    actions: list(raw.actions ?? []).map((value) => {
      const item = object(value);
      return {
        key: key(item.key),
        label: text(item.label),
        operationKey: key(item.operationKey),
        placement: choice(item.placement ?? "overflow", [
          "primary",
          "secondary",
          "overflow",
        ] as const),
      };
    }),
  };
  unique(result.sections.map((item) => item.key));
  if (result.panel) {
    const sections = new Set(result.sections.map((item) => item.key));
    for (const reference of [
      ...result.panel.sections,
      ...result.panel.tabs.flatMap((tab) =>
        tab.sectionKey ? [tab.sectionKey] : [],
      ),
    ])
      if (!sections.has(reference))
        throw new TypeError(`Unknown 360 section: ${reference}`);
  }
  unique(result.actions.map((item) => item.key));
  if (result.actions.filter((item) => item.placement === "primary").length > 1)
    throw new TypeError("Only one primary record action is allowed");
  return Object.freeze(result);
}
export function validateRecordPresentationReferences(
  presentation: EntityRecordPresentationV1,
  fields: readonly string[],
  operations: readonly string[],
) {
  const referenced = [
    presentation.titleField,
    ...(presentation.codeField ? [presentation.codeField] : []),
    ...presentation.subtitleFields,
    ...presentation.contextFields,
    ...presentation.badges.map((item) => item.field),
    ...presentation.sections.flatMap((item) => item.fields),
  ];
  for (const field of referenced)
    if (!fields.includes(field))
      throw new TypeError(`Unknown record presentation field: ${field}`);
  for (const action of presentation.actions)
    if (!operations.includes(action.operationKey))
      throw new TypeError(
        `Unknown record presentation operation: ${action.operationKey}`,
      );
}
/** Intersection happens before the presentation is sent to a browser. */
export function readableRecordPresentation(
  presentation: EntityRecordPresentationV1,
  fields: readonly string[],
  operations: readonly string[],
  fallbackTitle: string,
): EntityRecordPresentationV1 {
  return {
    ...presentation,
    titleField: fields.includes(presentation.titleField)
      ? presentation.titleField
      : fallbackTitle,
    codeField:
      presentation.codeField && fields.includes(presentation.codeField)
        ? presentation.codeField
        : undefined,
    subtitleFields: presentation.subtitleFields.filter((key) =>
      fields.includes(key),
    ),
    contextFields: presentation.contextFields.filter((key) =>
      fields.includes(key),
    ),
    badges: presentation.badges.filter((item) => fields.includes(item.field)),
    sections: presentation.sections
      .map((item) => ({
        ...item,
        fields: item.fields.filter((key) => fields.includes(key)),
      }))
      .filter((item) => item.fields.length > 0),
    actions: presentation.actions.filter((item) =>
      operations.includes(item.operationKey),
    ),
  };
}
export function recordDisplay(value: unknown): string | undefined {
  return typeof value === "string" && value.trim()
    ? value
    : typeof value === "number" || typeof value === "boolean"
      ? String(value)
      : undefined;
}
export function resolveRecordHeader(
  presentation: EntityRecordPresentationV1,
  values: Readonly<Record<string, unknown>>,
  options: {
    readonly entityLabel: string;
    readonly fallbackTitle: string;
    readonly labels?: Readonly<Record<string, string>>;
    readonly actions?: EntityRecordHeaderV1["actions"];
    readonly readOnly?: boolean;
  },
): EntityRecordHeaderV1 {
  const label = (key: string) =>
    options.labels?.[key] ?? key.replace(/[_.-]+/g, " ");
  return {
    title:
      recordDisplay(values[presentation.titleField]) ?? options.fallbackTitle,
    entityLabel: options.entityLabel,
    ...(presentation.iconKey ? { iconKey: presentation.iconKey } : {}),
    ...(presentation.codeField && recordDisplay(values[presentation.codeField])
      ? { code: recordDisplay(values[presentation.codeField]) }
      : {}),
    description:
      presentation.subtitleFields
        .map((key) => recordDisplay(values[key]))
        .filter(Boolean)
        .join(" · ") || undefined,
    badges: presentation.badges.flatMap((item) => {
      const value = recordDisplay(values[item.field]);
      return value
        ? [
            {
              label: item.label ? `${item.label}: ${value}` : value,
              tone: item.tones[value] ?? "neutral",
            },
          ]
        : [];
    }),
    context: presentation.contextFields.flatMap((key) => {
      const value = recordDisplay(values[key]);
      return value ? [{ key, label: label(key), value }] : [];
    }),
    actions: options.readOnly ? [] : (options.actions ?? []),
    sections: presentation.sections.map(({ key, label, placement }) => ({
      key,
      label,
      placement,
    })),
    ...(options.readOnly ? { readOnly: true } : {}),
  };
}
