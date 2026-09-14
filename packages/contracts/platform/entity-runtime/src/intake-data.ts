export const intakeReferenceSources = [
  "shared.bank_institution",
  "shared.bank_branch",
  "control.bank_account_type",
  "iso.currency",
  "iso.country",
  "shared.state_region",
  "control.bank_country",
  "neon.commodity_category",
  "shared.industry_code",
  "neon.tax_jurisdiction",
  "neon.tax_type",
  "neon.certification_type",
] as const;
import {
  parseValidationMessages,
  type ValidationMessages,
} from "./validation-messages";
import {
  parseRecentChoicePolicy,
  type RecentChoicePolicy,
} from "./recent-choice";
import { parseIntakeCondition, type IntakeCondition } from "./intake";
export interface IntakeInputField {
  readonly control: "input";
  readonly key: string;
  readonly valueKey: string;
  readonly label: string;
  readonly required: boolean;
  readonly validationMessages?: ValidationMessages;
  readonly visibleWhen?: IntakeCondition;
  readonly widget:
    | "hidden"
    | "text"
    | "textarea"
    | "url"
    | "date"
    | "password"
    | "integer"
    | "decimal"
    | "checkbox"
    | "select"
    | "registered";
  readonly columnSpan: number;
  readonly helpText?: string;
  readonly placeholder?: string;
  readonly defaultValue?: string | number | boolean;
  readonly maxLength?: number;
  readonly normalize?: "uppercase" | "lowercase";
  readonly handlerKey?: string;
  readonly pattern?: string;
  readonly referenceRules?: {
    readonly value?: string;
    readonly widget?: string;
    readonly required?: string;
    readonly field: string;
    readonly label?: string;
    readonly pattern?: string;
    readonly placeholder?: string;
    readonly helpText?: string;
  };
  readonly format?: "bic" | "iban";
  readonly revealLabels?: { readonly show: string; readonly hide: string };
  readonly variants?: readonly {
    readonly when: IntakeCondition;
    readonly format?: "bic" | "iban" | "none";
    readonly label?: string;
    readonly helpText?: string;
    readonly widget?: "text" | "hidden";
    readonly required?: boolean;
  }[];
  readonly clearOnChange?: {
    readonly mode?: "inline" | "dialog";
    readonly title?: string;
    readonly fields: readonly string[];
    readonly message: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
  };

  readonly attachmentLabels?: Readonly<{
    uploadNotAllowed?: string;
    uploading: string;
    attached: string;
    unavailable: string;
    uploadFailed: string;
    processing: string;
    selectExisting: string;
  }>;
  readonly payload?: {
    readonly target: "context" | "canonical" | "request_only";
    readonly path: string;
  };
  readonly lookup?: {
    readonly sourceKey?: string;
    readonly filterBy?: readonly {
      readonly field: string;
      readonly property: string;
    }[];
    readonly copyFields?: readonly {
      readonly from: string;
      readonly to: string;
    }[];
    readonly fallbackToAll?: boolean;
    readonly emptyText?: string;

    readonly recent?: RecentChoicePolicy;
    readonly options?: readonly {
      readonly value: string;
      readonly label: string;
      readonly data?: Readonly<
        Record<string, string | boolean | readonly string[]>
      >;
    }[];
  };
}
/** Bounded presentation only; business rules remain on fields and service bindings. */
export interface CollectionPresentation {
  readonly renderer:
    | "generic"
    | "addresses"
    | "contacts"
    | "bank-accounts"
    | "certifications"
    | "documents"
    | "channels";
  readonly titleFields?: readonly string[];
  readonly summary: readonly {
    readonly field: string;
    readonly format?: "text" | "masked" | "count" | "primary";
  }[];
  readonly emptyText: string;
  readonly editLabel: string;
  readonly doneLabel: string;
  readonly issuesLabel: string;
  readonly duplicateCheck?: {
    readonly fields: readonly string[];
    readonly requireAny: readonly string[];
    readonly label: string;
    readonly message: string;
  };
  readonly headingCount?: boolean;
  readonly validateOnDone?: boolean;
  readonly removalConfirmation?: {
    readonly mode?: "inline" | "dialog";
    readonly title?: string;
    readonly titleFields?: readonly string[];
    readonly impactField?: string;
    readonly impactMessage?: string;
    readonly message: string;
    readonly confirmLabel: string;
    readonly cancelLabel: string;
  };
}
export function parseCollectionPresentation(
  raw: unknown,
): CollectionPresentation {
  const p = object(raw);
  if (
    Object.keys(p).some(
      (k) =>
        ![
          "renderer",
          "summary",
          "titleFields",
          "emptyText",
          "editLabel",
          "doneLabel",
          "issuesLabel",
          "duplicateCheck",
          "headingCount",
          "validateOnDone",
          "removalConfirmation",
        ].includes(k),
    ) ||
    ![
      "generic",
      "addresses",
      "contacts",
      "bank-accounts",
      "certifications",
      "documents",
      "channels",
    ].includes(p.renderer) ||
    !Array.isArray(p.summary) ||
    p.summary.length < 1 ||
    p.summary.length > 12
  )
    throw Error("INTAKE_COLLECTION_PRESENTATION");
  for (const name of ["headingCount", "validateOnDone"])
    if (p[name] !== undefined && typeof p[name] !== "boolean")
      throw Error("INTAKE_COLLECTION_PRESENTATION");
  let removalConfirmation: CollectionPresentation["removalConfirmation"];
  if (p.removalConfirmation !== undefined) {
    const r = object(p.removalConfirmation);
    if (
      Object.keys(r).some(
        (k) =>
          ![
            "message",
            "confirmLabel",
            "cancelLabel",
            "mode",
            "title",
            "titleFields",
            "impactField",
            "impactMessage",
          ].includes(k),
      )
    )
      throw Error("INTAKE_COLLECTION_PRESENTATION");
    if (r.mode !== undefined && !["inline", "dialog"].includes(r.mode))
      throw Error("INTAKE_COLLECTION_PRESENTATION");
    if (
      r.titleFields !== undefined &&
      (!Array.isArray(r.titleFields) || r.titleFields.length > 12)
    )
      throw Error("INTAKE_COLLECTION_PRESENTATION");
    removalConfirmation = {
      ...(r.mode ? { mode: r.mode } : {}),
      ...(r.title ? { title: text(r.title) } : {}),
      ...(r.titleFields ? { titleFields: r.titleFields.map(key) } : {}),
      ...(r.impactField ? { impactField: key(r.impactField) } : {}),
      ...(r.impactMessage ? { impactMessage: text(r.impactMessage) } : {}),
      message: text(r.message),
      confirmLabel: text(r.confirmLabel),
      cancelLabel: text(r.cancelLabel),
    };
  }
  if (
    p.titleFields !== undefined &&
    (!Array.isArray(p.titleFields) ||
      !p.titleFields.length ||
      p.titleFields.length > 12)
  )
    throw Error("INTAKE_COLLECTION_PRESENTATION");
  const summary = p.summary.map((raw: unknown) => {
    const f = object(raw);
    if (
      Object.keys(f).some((k) => !["field", "format"].includes(k)) ||
      (f.format !== undefined &&
        !["text", "masked", "count", "primary"].includes(f.format))
    )
      throw Error("INTAKE_COLLECTION_SUMMARY");
    return { field: key(f.field), ...(f.format ? { format: f.format } : {}) };
  });
  if (
    new Set(summary.map((f: { field: string }) => f.field)).size !==
    summary.length
  )
    throw Error("INTAKE_COLLECTION_SUMMARY_DUPLICATE");
  return {
    ...(p.duplicateCheck
      ? {
          duplicateCheck: (() => {
            const d = object(p.duplicateCheck);
            if (
              Object.keys(d).some(
                (k) =>
                  !["fields", "requireAny", "label", "message"].includes(k),
              ) ||
              !Array.isArray(d.fields) ||
              !d.fields.length ||
              d.fields.length > 24 ||
              !Array.isArray(d.requireAny) ||
              !d.requireAny.length ||
              d.requireAny.length > 24
            )
              throw Error("INTAKE_DUPLICATE_CHECK");
            return {
              fields: d.fields.map(key),
              requireAny: d.requireAny.map(key),
              label: text(d.label),
              message: text(d.message),
            };
          })(),
        }
      : {}),
    renderer: p.renderer,
    ...(p.titleFields ? { titleFields: p.titleFields.map(key) } : {}),
    summary,
    emptyText: text(p.emptyText),
    editLabel: text(p.editLabel),
    doneLabel: text(p.doneLabel),
    issuesLabel: text(p.issuesLabel),
    ...(p.headingCount !== undefined ? { headingCount: p.headingCount } : {}),
    ...(p.validateOnDone !== undefined
      ? { validateOnDone: p.validateOnDone }
      : {}),
    ...(removalConfirmation ? { removalConfirmation } : {}),
  };
}
export interface IntakeRepeatableField {
  readonly presentation?: CollectionPresentation;
  readonly control: "repeatableGroup";
  readonly key: string;
  readonly valueKey: string;
  readonly label: string;
  readonly itemLabel: string;
  readonly addLabel: string;
  readonly removeLabel: string;
  readonly itemSurfaceKey: string;
  /** Conditional requiredness evaluated against the containing form. */
  readonly itemFieldRules?: readonly {
    readonly when: IntakeCondition;
    readonly fields: readonly string[];
    readonly required: boolean;
  }[];
  readonly extensionGroup?: string;
  readonly requiredItemValues?: readonly Readonly<{
    field: string;
    value: string;
    minItems: number;
    message: string;
  }>[];
  readonly minItems: number;
  readonly maxItems: number;
  readonly primaryField?: string;
  readonly primaryLabel?: string;
  readonly columnSpan: number;
  readonly visibleWhen?: IntakeCondition;
}
export type IntakeDataField = IntakeInputField | IntakeRepeatableField;
const object = (x: unknown): Record<string, any> => {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw Error("INTAKE_DATA_OBJECT");
  return x as Record<string, any>;
};
const text = (x: unknown) => {
  if (typeof x !== "string" || !x.trim() || x.length > 4000)
    throw Error("INTAKE_DATA_TEXT");
  return x;
};
const key = (x: unknown) => {
  const s = text(x);
  if (
    s
      .split(/[.-]/)
      .some((p) => ["__proto__", "constructor", "prototype"].includes(p)) ||
    !/^[a-z][a-zA-Z0-9_.-]{0,126}$/.test(s) ||
    ["__proto__", "constructor", "prototype"].includes(s)
  )
    throw Error("INTAKE_DATA_KEY");
  return s;
};
const integer = (x: unknown, min: number, max: number) => {
  if (!Number.isInteger(x) || Number(x) < min || Number(x) > max)
    throw Error("INTAKE_DATA_BOUND");
  return Number(x);
};
export function parseIntakeDataField(raw: unknown): IntakeDataField {
  const f = object(raw),
    common = {
      key: key(f.key),
      valueKey: key(f.valueKey),
      label: text(f.label),
      columnSpan: integer(f.columnSpan ?? 12, 1, 12),
      ...(f.visibleWhen
        ? { visibleWhen: parseIntakeCondition(f.visibleWhen) }
        : {}),
    };
  if (f.control === "repeatableGroup") {
    const minItems = integer(f.minItems, 0, 100),
      maxItems = integer(f.maxItems, 1, 100);
    if (minItems > maxItems) throw Error("INTAKE_GROUP_BOUNDS");
    return {
      ...common,
      control: "repeatableGroup",
      ...(f.presentation === undefined
        ? {}
        : { presentation: parseCollectionPresentation(f.presentation) }),
      itemSurfaceKey: key(f.itemSurfaceKey),
      ...(f.itemFieldRules === undefined ? {} : {itemFieldRules: (() => {
        if (!Array.isArray(f.itemFieldRules) || f.itemFieldRules.length > 12) throw Error("INTAKE_ITEM_FIELD_RULES");
        return f.itemFieldRules.map((raw: unknown) => {
          const rule = object(raw);
          if (typeof rule.required !== "boolean" || !Array.isArray(rule.fields) || !rule.fields.length || rule.fields.length > 100) throw Error("INTAKE_ITEM_FIELD_RULES");
          return {when: parseIntakeCondition(rule.when), fields: rule.fields.map(key), required: rule.required};
        });
      })()}),
      ...(f.extensionGroup === undefined
        ? {}
        : { extensionGroup: key(f.extensionGroup) }),
      itemLabel: text(f.itemLabel),
      addLabel: text(f.addLabel),
      removeLabel: text(f.removeLabel),
      minItems,
      maxItems,
      ...(f.requiredItemValues === undefined
        ? {}
        : {
            requiredItemValues: (() => {
              if (
                !Array.isArray(f.requiredItemValues) ||
                f.requiredItemValues.length > 20
              )
                throw Error("INTAKE_GROUP_REQUIREMENTS");
              return f.requiredItemValues.map((raw: unknown) => {
                const rule = object(raw);
                return {
                  field: key(rule.field),
                  value: text(rule.value),
                  minItems: integer(rule.minItems, 1, maxItems),
                  message: text(rule.message),
                };
              });
            })(),
          }),
      ...(f.primaryField
        ? {
            primaryField: key(f.primaryField),
            primaryLabel: text(f.primaryLabel),
          }
        : {}),
    };
  }
  if (
    f.control !== "input" ||
    ![
      "hidden",
      "text",
      "textarea",
      "url",
      "date",
      "password",
      "integer",
      "decimal",
      "checkbox",
      "select",
      "registered",
    ].includes(f.widget) ||
    typeof f.required !== "boolean"
  )
    throw Error("INTAKE_INPUT_WIDGET");
  if (
    f.normalize !== undefined &&
    !["uppercase", "lowercase"].includes(f.normalize)
  )
    throw Error("INTAKE_NORMALIZE");
  if (
    f.defaultValue !== undefined &&
    (!["string", "number", "boolean"].includes(typeof f.defaultValue) ||
      (typeof f.defaultValue === "number" && !Number.isFinite(f.defaultValue)))
  )
    throw Error("INTAKE_DEFAULT");
  const lookup = f.lookup === undefined ? undefined : object(f.lookup);
  if (
    lookup?.sourceKey !== undefined &&
    !(intakeReferenceSources as readonly unknown[]).includes(lookup.sourceKey)
  )
    throw Error("INTAKE_LOOKUP_SOURCE_UNREGISTERED");
  if (lookup?.options !== undefined && !Array.isArray(lookup.options))
    throw Error("INTAKE_OPTIONS");
  const options = lookup?.options?.map((o: unknown) => {
    const v = object(o);
    return {
      value: text(v.value),
      label: text(v.label),
      ...(v.data
        ? {
            data: Object.fromEntries(
              Object.entries(object(v.data)).map(([k, value]) => [
                key(k),
                Array.isArray(value)
                  ? value.map(text)
                  : typeof value === "boolean"
                    ? value
                    : value === ""
                      ? ""
                      : text(value),
              ]),
            ),
          }
        : {}),
    };
  });
  if (
    options &&
    (options.length > 2000 ||
      new Set(options.map((o: { value: string }) => o.value)).size !==
        options.length)
  )
    throw Error("INTAKE_OPTIONS");
  if (f.widget === "select" && !lookup?.sourceKey && !options?.length)
    throw Error("INTAKE_OPTIONS_REQUIRED");
  const payload = f.payload === undefined ? undefined : object(f.payload);
  if (
    payload &&
    !["context", "canonical", "request_only"].includes(payload.target)
  )
    throw Error("INTAKE_PAYLOAD_TARGET");
  return {
    ...common,
    control: "input",
    widget: f.widget,
    ...(f.format === undefined
      ? {}
      : { format: parseFormat(f.format, false) as "bic" | "iban" }),
    ...(f.revealLabels
      ? {
          revealLabels: {
            show: text(object(f.revealLabels).show),
            hide: text(object(f.revealLabels).hide),
          },
        }
      : {}),
    ...(f.clearOnChange
      ? {
          clearOnChange: (() => {
            const c = object(f.clearOnChange);
            if (!Array.isArray(c.fields) || c.fields.length > 20)
              throw Error("INTAKE_CLEAR_FIELDS");
            if (
              c.mode !== undefined &&
              !["inline", "dialog"].includes(String(c.mode))
            )
              throw Error("INTAKE_CLEAR_MODE");
            return {
              ...(c.mode ? { mode: c.mode as "inline" | "dialog" } : {}),
              ...(c.title ? { title: text(c.title) } : {}),
              fields: c.fields.map(key),
              message: text(c.message),
              confirmLabel: text(c.confirmLabel),
              cancelLabel: text(c.cancelLabel),
            };
          })(),
        }
      : {}),
    ...(f.referenceRules === undefined
      ? {}
      : {
          referenceRules: (() => {
            const r = object(f.referenceRules);
            if (
              Object.keys(r).some(
                (k) =>
                  ![
                    "field",
                    "label",
                    "pattern",
                    "placeholder",
                    "helpText",
                    "value",
                    "widget",
                    "required",
                  ].includes(k),
              )
            )
              throw Error("INTAKE_REFERENCE_RULES");
            return {
              field: key(r.field),
              ...Object.fromEntries(
                [
                  "label",
                  "pattern",
                  "placeholder",
                  "helpText",
                  "value",
                  "widget",
                  "required",
                ].flatMap((k) => (r[k] === undefined ? [] : [[k, key(r[k])]])),
              ),
            };
          })(),
        }),
    ...(f.variants
      ? {
          variants: (() => {
            if (!Array.isArray(f.variants) || f.variants.length > 12)
              throw Error("INTAKE_VARIANTS");
            return f.variants.map((raw: unknown) => {
              const v = object(raw);
              if (
                Object.keys(v).some(
                  (k) =>
                    ![
                      "when",
                      "label",
                      "helpText",
                      "value",
                      "widget",
                      "required",
                      "widget",
                      "required",
                      "format",
                    ].includes(k),
                ) ||
                (v.widget !== undefined &&
                  !["text", "hidden"].includes(v.widget)) ||
                (v.required !== undefined && typeof v.required !== "boolean")
              )
                throw Error("INTAKE_VARIANT");
              return {
                when: parseIntakeCondition(v.when),
                ...(v.format === undefined
                  ? {}
                  : { format: parseFormat(v.format, true) }),
                ...(v.label ? { label: text(v.label) } : {}),
                ...(v.helpText ? { helpText: text(v.helpText) } : {}),
                ...(v.widget ? { widget: v.widget } : {}),
                ...(v.required !== undefined ? { required: v.required } : {}),
              };
            });
          })(),
        }
      : {}),
    required: f.required,
    validationMessages: parseValidationMessages(f.validationMessages),
    ...(f.attachmentLabels
      ? {
          attachmentLabels: Object.fromEntries(
            [
              "uploading",
              "attached",
              "unavailable",
              "uploadFailed",
              "processing",
              "selectExisting",
              ...(object(f.attachmentLabels).uploadNotAllowed === undefined
                ? []
                : ["uploadNotAllowed"]),
            ].map((k) => [k, text(object(f.attachmentLabels)[k])]),
          ) as NonNullable<IntakeInputField["attachmentLabels"]>,
        }
      : {}),
    ...(f.helpText ? { helpText: text(f.helpText) } : {}),
    ...(f.placeholder ? { placeholder: text(f.placeholder) } : {}),
    ...(f.defaultValue !== undefined ? { defaultValue: f.defaultValue } : {}),
    ...(f.maxLength !== undefined
      ? { maxLength: integer(f.maxLength, 1, 100000) }
      : {}),
    ...(f.normalize ? { normalize: f.normalize } : {}),
    ...(f.widget === "registered" ? { handlerKey: key(f.handlerKey) } : {}),
    ...(lookup
      ? {
          lookup: {
            ...(lookup.sourceKey ? { sourceKey: lookup.sourceKey } : {}),
            ...(lookup.recent === undefined
              ? {}
              : { recent: parseRecentChoicePolicy(lookup.recent) }),
            ...(options ? { options } : {}),
            ...(lookup.filterBy
              ? { filterBy: pairs(lookup.filterBy, "field", "property") }
              : {}),
            ...(lookup.copyFields
              ? { copyFields: pairs(lookup.copyFields, "from", "to") }
              : {}),
            ...(lookup.emptyText ? { emptyText: text(lookup.emptyText) } : {}),
            ...(lookup.fallbackToAll === undefined
              ? {}
              : {
                  fallbackToAll: (() => {
                    if (typeof lookup.fallbackToAll !== "boolean")
                      throw Error("INTAKE_LOOKUP_FALLBACK");
                    return lookup.fallbackToAll;
                  })(),
                }),
          },
        }
      : {}),
    ...(payload
      ? { payload: { target: payload.target, path: key(payload.path) } }
      : {}),
  };
}

function pairs<A extends string, B extends string>(
  raw: unknown,
  a: A,
  b: B,
): Record<A | B, string>[] {
  if (!Array.isArray(raw) || raw.length > 20)
    throw Error("INTAKE_LOOKUP_BINDINGS");
  return raw.map((v) => {
    const p = object(v);
    if (Object.keys(p).some((k) => k !== a && k !== b))
      throw Error("INTAKE_LOOKUP_BINDING");
    return { [a]: key(p[a]), [b]: key(p[b]) } as Record<A | B, string>;
  });
}

function parseFormat(value: unknown, none: boolean): "bic" | "iban" | "none" {
  if (value !== "bic" && value !== "iban" && !(none && value === "none"))
    throw Error("INTAKE_FORMAT");
  return value as "bic" | "iban" | "none";
}
