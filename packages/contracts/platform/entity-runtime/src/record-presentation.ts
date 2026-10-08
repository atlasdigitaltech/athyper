import { parseEntityRelationships, type EntityRelationshipV1 } from "./entity-relationship";
import { parseEntitySectionComponent, readableEntitySectionComponent, type EntitySectionComponentV1 } from "./section-component";
import type { EntityAccessDecisionV1 } from "./access-decision";
import { isObjectRecord, isBoundedNonBlankText } from "./validation/values";
import { resolveEntityStatusTone } from "./runtime-values";
import { readablePresentationLocalization, parsePresentationLocalization, type EntityPresentationLocalizationV1 } from "./presentation-localization";
import { parseEntityRuntimeLocalizedText, type EntityRuntimeLocalizedTextV1 } from "./runtime-resource";
import { parseEntityDetailNavigation, type EntityDetailNavigationV1 } from "./detail-navigation";
import { parseRelatedPresentations, type RelatedPresentationV1 } from "./related-presentation";
import {
  parseRecord360Panel,
  type EntityRecord360PanelV1,
} from "./record-360-panel";
/** Published record presentation contains field and operation references, never executable UI. */
export type RecordBadgeTone = "neutral" | "success" | "warning" | "danger";
export interface EntityRecordPresentationV1 {
  readonly entityRelationships?: readonly EntityRelationshipV1[];
  readonly localizedLabels?: EntityPresentationLocalizationV1;
  readonly schemaVersion: 1;
  /** Absent on older definitions: retain selected-section behavior. */
  readonly navigation?: EntityDetailNavigationV1;
  readonly related?: readonly RelatedPresentationV1[];
  readonly panel?: EntityRecord360PanelV1;
  /** Optional, provider-backed decision support shown beside any record mode. */
  readonly summaryView?: EntityRecordSummaryViewV1;
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
    readonly component?: EntitySectionComponentV1;
    readonly key: string;
    readonly label: string;
    readonly localizedLabel?: EntityRuntimeLocalizedTextV1;
    readonly fields: readonly string[];
    readonly placement: "direct" | "overflow";
    readonly scopePrompt?: string;
    readonly relationshipKey?: string;
    /** Semantic icon key; the runtime falls back when absent or unknown. */
    readonly iconKey?: string;
  }[];
  readonly actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly operationKey: string;
    readonly placement: "primary" | "secondary" | "overflow";
  }[];
}
export interface EntityRecordSummaryViewV1 {
  readonly schemaVersion: 1;
  readonly cards: readonly {
    readonly key: string;
    readonly label: string;
    readonly provider: string;
    readonly rendererKey: string;
  }[];
}
export interface EntityRecordHeaderV1 {
  readonly relatedActions?: readonly { readonly operationKey: string; readonly href: string; readonly decision?: EntityAccessDecisionV1 }[];
  readonly related?: readonly RelatedPresentationV1[];
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
    readonly operationKey?: string;
    readonly decision?: EntityAccessDecisionV1;
  }[];
  readonly sections: readonly {
    readonly key: string;
    readonly label: string;
    readonly placement: "direct" | "overflow";
    readonly scopePrompt?: string;
    readonly count?: number;
    readonly iconKey?: string;
  }[];
  readonly readOnly?: boolean;
}
const key = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_.-]{0,126}$/.test(value))
    throw new TypeError("Invalid record presentation reference");
  return value;
};
const text = (value: unknown): string => {
  if (!isBoundedNonBlankText(value, 200))
    throw new TypeError("Invalid record presentation label");
  return value.trim();
};
const object = (value: unknown): Record<string, unknown> => {
  if (!isObjectRecord(value))
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
  const panel = raw.panel === undefined ? undefined : parseRecord360Panel(raw.panel);
  const summaryView = raw.summaryView === undefined
    ? summaryViewFromPanel(panel)
    : parseRecordSummaryView(raw.summaryView);
  const result: EntityRecordPresentationV1 = {
    schemaVersion: 1,
    ...(raw.entityRelationships === undefined ? {} : { entityRelationships: parseEntityRelationships(raw.entityRelationships) }),
    ...(raw.localizedLabels === undefined ? {} : { localizedLabels: parsePresentationLocalization(raw.localizedLabels) }),
    ...(raw.related === undefined ? {} : { related: parseRelatedPresentations(raw.related) }),
    ...(panel ? { panel } : {}),
    ...(summaryView ? { summaryView } : {}),
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
        ...(item.localizedLabel === undefined ? {} : { localizedLabel: parseEntityRuntimeLocalizedText(item.localizedLabel) }),
        fields: list(item.fields ?? []).map(key),
        ...(item.component === undefined ? {} : {component: parseEntitySectionComponent(item.component, list(item.fields ?? []).map(key))}),
        ...(item.relationshipKey === undefined ? {} : { relationshipKey: key(item.relationshipKey) }),
        ...(item.scopePrompt === undefined ? {} : { scopePrompt: text(item.scopePrompt) }),
        ...(item.iconKey === undefined ? {} : { iconKey: key(item.iconKey) }),
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
  for (const section of result.sections) if (section.relationshipKey) {
    if (section.fields.length || !result.entityRelationships?.some(relation => relation.key === section.relationshipKey))
      throw new TypeError("Invalid related entity section");
  }
  for (const profile of result.related ?? []) if (!result.sections.some(section => section.key === profile.sectionKey)) throw new TypeError(`Unknown related section: ${profile.sectionKey}`);
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
  return Object.freeze({ ...result, ...(raw.navigation === undefined ? {} : {
    navigation: parseEntityDetailNavigation(raw.navigation, result.sections.map(section => section.key)),
  }) });
}

/** Legacy 360 sidebars are projected as generic summary cards until republished. */
function summaryViewFromPanel(panel?: EntityRecord360PanelV1): EntityRecordSummaryViewV1 | undefined {
  if (!panel?.sidebar.length) return undefined;
  return Object.freeze({
    schemaVersion: 1,
    cards: Object.freeze(panel.sidebar.map((item) => Object.freeze({
      key: item.key,
      label: item.label,
      provider: item.provider,
      rendererKey: item.provider === "primary-contact" ? "platform.contact.summary.v1" : "platform.address.summary.v1",
    }))),
  });
}

export function parseRecordSummaryView(value: unknown): EntityRecordSummaryViewV1 {
  const raw = object(value);
  if (raw.schemaVersion !== 1) throw new TypeError("Invalid record summary view version");
  const rawCards = list(raw.cards);
  if (rawCards.length > 12) throw new TypeError("Invalid record summary view cards");
  const cards = rawCards.map((value) => {
    const card = object(value);
    return {
      key: key(card.key),
      label: text(card.label),
      provider: key(card.provider),
      rendererKey: key(card.rendererKey),
    };
  });
  if (!cards.length || new Set(cards.map((card) => card.key)).size !== cards.length)
    throw new TypeError("Invalid record summary view cards");
  return Object.freeze({ schemaVersion: 1, cards: Object.freeze(cards) });
}
export function validateRecordPresentationReferences(
  presentation: EntityRecordPresentationV1,
  fields: readonly string[],
  operations: readonly string[],
) {
  const referenced = [
    ...Object.keys(presentation.localizedLabels?.fields ?? {}),
    presentation.titleField,
    ...(presentation.codeField ? [presentation.codeField] : []),
    ...presentation.subtitleFields,
    ...presentation.contextFields,
    ...presentation.badges.map((item) => item.field),
    ...presentation.sections.flatMap((item) => item.fields),
  ];
  for (const relation of presentation.entityRelationships ?? []) referenced.push(relation.tenant.source, ...relation.fields.map(field => field.source));
  for (const field of referenced)
    if (!fields.includes(field))
      throw new TypeError(`Unknown record presentation field: ${field}`);
  for (const action of [...presentation.actions, ...(presentation.related ?? []).flatMap(profile => profile.actions)])
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
  authorizedRelationships: readonly string[] = [],
): EntityRecordPresentationV1 {
  const visibleSections = presentation.sections.filter(section => section.fields.some(key => fields.includes(key)) || Boolean(section.relationshipKey && authorizedRelationships.includes(section.relationshipKey))).map(section => section.key);
  return {
    ...presentation,
    ...(presentation.entityRelationships ? {entityRelationships: presentation.entityRelationships.filter(relation => authorizedRelationships.includes(relation.key))} : {}),
    ...(presentation.localizedLabels ? { localizedLabels: readablePresentationLocalization(presentation.localizedLabels, fields) } : {}),
    ...(presentation.navigation ? { navigation: {
      mode: presentation.navigation.mode,
      ...(presentation.navigation.tabs ? { tabs: presentation.navigation.tabs.map(tab => ({
        ...tab, sectionKeys: tab.sectionKeys.filter(key => visibleSections.includes(key)),
      })).filter(tab => tab.sectionKeys.length) } : {}),
    } } : {}),
    // Related projections have their own authorization boundary; flat entity fields cannot authorize them.
    related: undefined,
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
        component: readableEntitySectionComponent(item.component, fields),
      }))
      .filter((item) => item.fields.length > 0 || Boolean(item.relationshipKey && authorizedRelationships.includes(item.relationshipKey))),
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
    readonly choiceLabels?: Readonly<Record<string, Readonly<Record<string, string>>>>;
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
              label: item.label ? `${item.label}: ${options.choiceLabels?.[item.field]?.[value] ?? value}` : (options.choiceLabels?.[item.field]?.[value] ?? value),
              tone: resolveEntityStatusTone(value, item.tones),
            },
          ]
        : [];
    }),
    context: presentation.contextFields.flatMap((key) => {
      const value = recordDisplay(values[key]);
      return value ? [{ key, label: label(key), value }] : [];
    }),
    actions: options.readOnly ? [] : (options.actions ?? []),
    sections: presentation.sections.map(({ key, label, placement, iconKey }) => ({
      key,
      label,
      placement,
      ...(iconKey ? { iconKey } : {}),
    })),
    ...(options.readOnly ? { readOnly: true } : {}),
  };
}
