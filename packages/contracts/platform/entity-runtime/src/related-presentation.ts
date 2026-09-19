/** Versioned, data-only presentations for registered related-record projections. */
export type DetailRenderer =
  "text" | "date" | "datetime" | "boolean" | "country" | "lookup" | "badge";
export interface DetailFieldV1 {
  readonly key: string;
  readonly field: string;
  readonly label: string;
  readonly renderer: DetailRenderer;
  readonly lookup?: {
    readonly scopeField: string;
    readonly values: Readonly<Record<string, Readonly<Record<string, string>>>>;
  };
  readonly values?: Readonly<
    Record<
      string,
      Readonly<{
        label: string;
        tone?: "neutral" | "success" | "warning" | "danger";
      }>
    >
  >;
}
export interface RelatedGroupV1 {
  readonly key: string;
  readonly label: string;
  readonly compact: boolean;
  readonly collapsed: boolean;
  readonly renderer: "fields" | "postal-address" | "channels" | "timeline";
  readonly fields: readonly DetailFieldV1[];
  readonly detail?: {
    readonly placement: "main" | "aside" | "footer";
    readonly showLabel: boolean;
    readonly omitFields: readonly string[];
    readonly columnWeights: readonly number[];
  };
}
export interface RelatedPresentationV1 {
  readonly schemaVersion: 1;
  readonly key: string;
  readonly sectionKey: string;
  readonly source:
    "contact-person.v1" | "address-link.v1" | "external-reference.v1";
  readonly titleField: string;
  readonly titleLabel?: string;
  readonly emptyLabel: string;
  readonly compactEmptyLabel: string;
  readonly viewAllLabel: string;
  readonly scopeLabel: string;
  readonly collectionOrder?: "primary-first" | "newest-first";
  readonly emptyFields: "hide" | "disclose";
  readonly summary?: {
    readonly layout: "postal-summary" | "contact-summary";
    /** References to published fields in group-key.field-key form. */
    readonly fields: readonly string[];
    readonly copyLabel: string;
  };
  readonly detail?: {
    readonly layout: "contact-detail" | "postal-detail" | "reference-detail";
    readonly headerFields: readonly string[];
    readonly copyLabel: string;
    readonly additionalFieldsLabel: string;
  };
  readonly groups: readonly RelatedGroupV1[];
  readonly actions: readonly {
    readonly key: string;
    readonly label: string;
    readonly operationKey: string;
  }[];
}

// These are projection contracts, not configurable queries. Providers bind owner/tenant
// relations on the server. The field catalogue is checked against their DTOs in tests.
export const RELATED_RECORD_MODELS = {
  "external-reference.v1": {
    sectionKey: "identity",
    entityCode: "external_reference",
    relationship: "business_partner.external_reference",
    fields: {
      sourceSystemCode: "string",
      externalEntityCode: "string",
      externalId: "string",
      externalCode: "string",
    },
  },
  "contact-person.v1": {
    sectionKey: "contacts",
    entityCode: "contact_person",
    relationship: "business_partner.contact_person",
    fields: {
      displayName: "string",
      businessTitle: "string",
      departmentName: "string",
      primary: "boolean",
    },
    channels: {
      type: "string",
      value: "string",
      purpose: "string",
      primary: "boolean",
      verified: "boolean",
      effectiveFrom: "date",
      effectiveUntil: "date",
      quality: "string",
    },
  },
  "address-link.v1": {
    sectionKey: "addresses",
    entityCode: "address",
    relationship: "business_partner.address_link",
    fields: {
      formattedAddress: "string",
      purpose: "string",
      addressKind: "string",
      primary: "boolean",
      validationStatus: "string",
      validationProvider: "string",
      validationConfidence: "number",
      validatedAt: "datetime",
      effectiveFrom: "date",
      effectiveUntil: "date",
      lines: "lines",
      locality: "string",
      region: "string",
      postalCode: "string",
      countryCode: "string",
    },
    timeline: {
      eventType: "string",
      occurredAt: "datetime",
      resultStatus: "string",
      confidence: "number",
      reasonCode: "string",
    },
  },
} as const;
const obj = (v: unknown): Record<string, unknown> => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new TypeError("Invalid related presentation object");
  return v as Record<string, unknown>;
};
function exact(v: Record<string, unknown>, keys: readonly string[]) {
  for (const k of Object.keys(v))
    if (!keys.includes(k))
      throw new TypeError(`Unknown related presentation property: ${k}`);
}
const label = (v: unknown): string => {
  if (typeof v !== "string" || !v.trim() || v.length > 200)
    throw new TypeError("Invalid related presentation label");
  return v.trim();
};
const key = (v: unknown): string => {
  const s = label(v);
  if (
    !/^[a-zA-Z][a-zA-Z0-9_.-]{0,126}$/.test(s) ||
    ["__proto__", "constructor", "prototype"].includes(s)
  )
    throw new TypeError("Invalid related presentation reference");
  return s;
};
const list = (v: unknown): unknown[] => {
  if (!Array.isArray(v) || v.length > 64)
    throw new TypeError("Invalid related presentation list");
  return v;
};
function unique(v: readonly string[]) {
  if (new Set(v).size !== v.length)
    throw new TypeError("Duplicate related presentation key");
}
function choice<T extends string>(v: unknown, values: readonly T[]): T {
  if (!values.includes(v as T))
    throw new TypeError(
      `Unregistered related presentation choice: ${String(v)}`,
    );
  return v as T;
}
function flag(v: unknown): boolean {
  if (v === undefined) return false;
  if (typeof v !== "boolean")
    throw new TypeError("Invalid related presentation boolean");
  return v;
}
export function parseRelatedPresentations(
  value: unknown,
): readonly RelatedPresentationV1[] {
  const result = list(value).map((candidate) => {
    const raw = obj(candidate);
    exact(raw, [
      "schemaVersion",
      "key",
      "sectionKey",
      "source",
      "titleField",
      "titleLabel",
      "emptyLabel",
      "compactEmptyLabel",
      "viewAllLabel",
      "scopeLabel",
      "collectionOrder",
      "emptyFields",
      "groups",
      "summary",
      "detail",
      "actions",
    ]);
    if (raw.schemaVersion !== 1)
      throw new TypeError("Invalid related presentation version");
    const source = choice(raw.source, [
        "contact-person.v1",
        "address-link.v1",
        "external-reference.v1",
      ] as const),
      model = RELATED_RECORD_MODELS[source];
    const sectionKey = key(raw.sectionKey);
    if (sectionKey !== model.sectionKey)
      throw new TypeError("Related presentation source/section mismatch");
    const titleField = key(raw.titleField);
    if (
      !Object.hasOwn(model.fields, titleField) ||
      (model.fields as Record<string, string>)[titleField] !== "string"
    )
      throw new TypeError("Unknown related title field");
    const groups = list(raw.groups).map((candidate) => {
      const group = obj(candidate);
      exact(group, [
        "key",
        "label",
        "compact",
        "collapsed",
        "renderer",
        "fields",
        "detail",
      ]);
      const renderer = choice(group.renderer, [
        "fields",
        "postal-address",
        "channels",
        "timeline",
      ] as const);
      if (
        ((renderer === "postal-address" || renderer === "timeline") &&
          source !== "address-link.v1") ||
        (renderer === "channels" && source !== "contact-person.v1")
      )
        throw new TypeError("Renderer is incompatible with related source");
      const catalogue: Readonly<Record<string, string>> =
        renderer === "channels"
          ? RELATED_RECORD_MODELS["contact-person.v1"].channels
          : renderer === "timeline"
            ? RELATED_RECORD_MODELS["address-link.v1"].timeline
            : model.fields;
      const fields = list(group.fields ?? []).map((candidate) => {
        const field = obj(candidate);
        exact(field, ["key", "field", "label", "renderer", "values", "lookup"]);
        const binding = key(field.field),
          type = Object.hasOwn(catalogue, binding)
            ? catalogue[binding]
            : undefined;
        if (!type) throw new TypeError(`Unknown related field: ${binding}`);
        const renderer = choice(field.renderer, [
          "text",
          "date",
          "datetime",
          "boolean",
          "country",
          "lookup",
          "badge",
        ] as const);
        if (
          (renderer === "boolean" && type !== "boolean") ||
          (renderer === "date" && type !== "date") ||
          (renderer === "datetime" && type !== "datetime") ||
          (renderer === "country" && binding !== "countryCode")
        )
          throw new TypeError(`Incompatible renderer for ${binding}`);
        let lookup: DetailFieldV1["lookup"];
        if (field.lookup !== undefined) {
          const rawLookup = obj(field.lookup);
          exact(rawLookup, ["scopeField", "values"]);
          const scopeField = key(rawLookup.scopeField);
          if (
            renderer !== "lookup" ||
            !Object.hasOwn(catalogue, scopeField) ||
            catalogue[scopeField] !== "string"
          )
            throw new TypeError("Unknown or incompatible lookup scope field");
          const scopes = Object.entries(obj(rawLookup.values));
          if (scopes.length > 64) throw new TypeError("Too many lookup scopes");
          lookup = {
            scopeField,
            values: Object.fromEntries(
              scopes.map(([scope, entries]) => {
                key(scope);
                const labels = Object.entries(obj(entries));
                if (labels.length > 64)
                  throw new TypeError("Too many lookup labels");
                return [
                  scope,
                  Object.fromEntries(
                    labels.map(([code, value]) => [key(code), label(value)]),
                  ),
                ];
              }),
            ),
          };
        }
        const values =
          field.values === undefined
            ? undefined
            : Object.fromEntries(
                Object.entries(obj(field.values)).map(([state, v]) => {
                  if (
                    !state ||
                    state.length > 100 ||
                    ["__proto__", "constructor", "prototype"].includes(state)
                  )
                    throw new TypeError("Invalid status key");
                  const item = obj(v);
                  exact(item, ["label", "tone"]);
                  return [
                    state,
                    {
                      label: label(item.label),
                      ...(item.tone === undefined
                        ? {}
                        : {
                            tone: choice(item.tone, [
                              "neutral",
                              "success",
                              "warning",
                              "danger",
                            ] as const),
                          }),
                    },
                  ];
                }),
              );
        return {
          key: key(field.key),
          field: binding,
          label: label(field.label),
          renderer,
          ...(values ? { values } : {}),
          ...(lookup ? { lookup } : {}),
        };
      });
      unique(fields.map((f) => f.key));
      if (renderer === "postal-address" && fields.length)
        throw new TypeError(
          "Postal address uses the registered postal component bindings",
        );
      let detail: RelatedGroupV1["detail"];
      if (group.detail !== undefined) {
        const d = obj(group.detail);
        exact(d, ["placement", "showLabel", "omitFields", "columnWeights"]);
        const omitFields = list(d.omitFields ?? []).map(key);
        unique(omitFields);
        if (omitFields.some((k) => !fields.some((f) => f.key === k)))
          throw new TypeError("Unknown omitted detail field");
        const columnWeights = list(d.columnWeights ?? []).map((weight) => {
          if (
            typeof weight !== "number" ||
            !Number.isInteger(weight) ||
            weight < 1 ||
            weight > 8
          )
            throw new TypeError("Invalid detail column weight");
          return weight;
        });
        if (
          columnWeights.length &&
          (renderer !== "channels" || columnWeights.length !== fields.length)
        )
          throw new TypeError(
            "Detail column weights require one weight per channel field",
          );
        detail = {
          placement: choice(d.placement, ["main", "aside", "footer"] as const),
          showLabel: flag(d.showLabel),
          omitFields,
          columnWeights,
        };
      }
      return {
        key: key(group.key),
        label: label(group.label),
        compact: flag(group.compact),
        collapsed: flag(group.collapsed),
        renderer,
        fields,
        ...(detail ? { detail } : {}),
      };
    });
    unique(groups.map((g) => g.key));
    let summary: RelatedPresentationV1["summary"];
    if (raw.summary !== undefined) {
      const rawSummary = obj(raw.summary);
      exact(rawSummary, ["layout", "fields", "copyLabel"]);
      const layout = choice(rawSummary.layout, [
        "postal-summary",
        "contact-summary",
      ] as const);
      if (
        source === "external-reference.v1" ||
        (layout === "postal-summary") !== (source === "address-link.v1")
      )
        throw new TypeError(
          "Summary layout is incompatible with related source",
        );
      const fields = list(rawSummary.fields).map(key);
      unique(fields);
      const selected = fields.map((reference) => {
        const match = groups
          .flatMap((group) => group.fields.map((field) => ({ group, field })))
          .find(
            ({ group, field }) => `${group.key}.${field.key}` === reference,
          );
        if (
          !match ||
          (layout === "contact-summary"
            ? match.group.renderer !== "channels"
            : match.group.renderer !== "fields")
        )
          throw new TypeError(
            `Unknown or incompatible summary field: ${reference}`,
          );
        return match;
      });
      if (
        layout === "contact-summary" &&
        (!selected.some(({ field }) => field.field === "value") ||
          new Set(selected.map(({ group }) => group.key)).size !== 1)
      )
        throw new TypeError(
          "Contact summary requires one channel group with a value field",
        );
      summary = { layout, fields, copyLabel: label(rawSummary.copyLabel) };
    }

    let detail: RelatedPresentationV1["detail"];
    if (raw.detail !== undefined) {
      const d = obj(raw.detail);
      exact(d, [
        "layout",
        "headerFields",
        "copyLabel",
        "additionalFieldsLabel",
      ]);
      const layout = choice(d.layout, [
        "contact-detail",
        "postal-detail",
        "reference-detail",
      ] as const);
      if (
        layout !==
        (
          {
            "contact-person.v1": "contact-detail",
            "address-link.v1": "postal-detail",
            "external-reference.v1": "reference-detail",
          } as const
        )[source]
      )
        throw new TypeError(
          "Detail layout is incompatible with related source",
        );
      const headerFields = list(d.headerFields).map(key);
      unique(headerFields);
      for (const reference of headerFields) {
        const match = groups
          .flatMap((group) => group.fields.map((field) => ({ group, field })))
          .find(
            ({ group, field }) => `${group.key}.${field.key}` === reference,
          );
        if (
          !match ||
          match.group.renderer !== "fields" ||
          match.field.renderer !== "badge"
        )
          throw new TypeError("Unknown or incompatible detail header field");
      }
      detail = {
        layout,
        headerFields,
        copyLabel: label(d.copyLabel),
        additionalFieldsLabel: label(d.additionalFieldsLabel),
      };
    }

    const actions = list(raw.actions ?? []).map((candidate) => {
      const a = obj(candidate);
      exact(a, ["key", "label", "operationKey"]);
      return {
        key: key(a.key),
        label: label(a.label),
        operationKey: key(a.operationKey),
      };
    });
    unique(actions.map((a) => a.key));
    return {
      schemaVersion: 1 as const,
      key: key(raw.key),
      sectionKey,
      source,
      titleField,
      ...(raw.titleLabel === undefined
        ? {}
        : { titleLabel: label(raw.titleLabel) }),
      emptyLabel: label(raw.emptyLabel),
      compactEmptyLabel: label(raw.compactEmptyLabel ?? raw.emptyLabel),
      viewAllLabel: label(raw.viewAllLabel),
      scopeLabel: label(raw.scopeLabel),
      ...(raw.collectionOrder === undefined
        ? {}
        : {
            collectionOrder: choice(raw.collectionOrder, [
              "primary-first",
              "newest-first",
            ] as const),
          }),
      emptyFields: choice(raw.emptyFields ?? "hide", [
        "hide",
        "disclose",
      ] as const),
      groups,
      ...(summary ? { summary } : {}),
      ...(detail ? { detail } : {}),
      actions,
    };
  });
  unique(result.map((p) => p.key));
  unique(result.map((p) => p.sectionKey));
  return Object.freeze(result);
}

/** Related adapters are registered for an owner entity; metadata cannot invent joins. */
export function validateRelatedPresentationOwner(
  profiles: readonly RelatedPresentationV1[],
  entityCode: string,
) {
  if (profiles.length && entityCode !== "business_partner")
    throw new TypeError(
      `No related record providers registered for ${entityCode}`,
    );
}
