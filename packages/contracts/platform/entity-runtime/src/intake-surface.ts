import {
  parseValidationMessages,
  type ValidationMessages,
} from "./validation-messages";
import { parseIntakeDataField, type IntakeDataField } from "./intake-data";
export * from "./intake-data";
import {
  parseEntityLookupField,
  type EntityLookupField,
} from "./entity-lookup";
import {
  intakeConditionMatches,
  parseIntakeCondition,
  type IntakeCondition,
} from "./intake";

export interface IntakeChoiceOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly availableWhen?: IntakeCondition;
  readonly unavailableReason?: string;
}
export interface ChoiceCardsPresentation {
  readonly layout: "stacked" | "grid";
  readonly optionColumns: 1 | 2;
  readonly density: "compact" | "comfortable";
}
export interface IntakeChoiceField {
  readonly presentation?: ChoiceCardsPresentation;
  readonly key: string;
  readonly control: "choiceCards";
  readonly label: string;
  readonly helpText?: string;
  readonly required: boolean;
  readonly visibleWhen?: IntakeCondition;
  readonly options: readonly IntakeChoiceOption[];
}
export type IntakeSurfaceField =
  IntakeChoiceField | EntityLookupField | IntakeDataField;
export interface EntityIntakeSurfaceV1 {
  readonly validationMessages?: ValidationMessages;
  readonly schemaVersion: 1;
  readonly key: string;
  readonly title: string;
  readonly formLabels?: {
    readonly continue: string;
    readonly submit: string;
    readonly chooseRoleHint?: string;
    readonly savedAt?: string;
    readonly copyReference?: string;
    readonly referenceCopied?: string;
    readonly copyFailed?: string;
    readonly changesNotSaved?: string;
    readonly requestTitle?: string;
    readonly editTitle?: string;
    readonly editDescription?: string;
    readonly close?: string;
    readonly draftStatus?: string;
    readonly notSaved?: string;
    readonly unsavedChanges?: string;
    readonly supplierRole?: string;
    readonly customerRole?: string;
    readonly saveDraft?: string;
    readonly draftSaved?: string;
    readonly savingDraft?: string;
    readonly draftRetry?: string;
    readonly incompatibleDraft?: string;
  };
  readonly columns: 1 | 2;
  readonly sections: readonly {
    readonly key: string;
    readonly title?: string;
    readonly description?: string;
    readonly header?: { readonly style: "accent"; readonly icon: string };
    readonly populatedSummaryFields?: readonly string[];
    readonly collapsible?: boolean;
    readonly columns?: number;
    readonly fields: readonly IntakeSurfaceField[];
  }[];
}
const fail = (message: string): never => {
  throw new TypeError(`Invalid intake surface: ${message}`);
};
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : fail("object required");
const text = (v: unknown): string =>
  typeof v === "string" && v.trim() && v.length <= 4000
    ? v
    : fail("text required");
const key = (v: unknown): string =>
  /^[a-z][a-z0-9_.-]{0,126}$/.test(text(v)) &&
  !["__proto__", "constructor", "prototype"].includes(String(v))
    ? String(v)
    : fail("key");
const array = (v: unknown): unknown[] =>
  Array.isArray(v) && v.length > 0 && v.length <= 64
    ? v
    : fail("nonempty array (maximum 64)");
const optionalText = (v: unknown) => (v === undefined ? undefined : text(v));
function unique(keys: readonly string[]) {
  if (new Set(keys).size !== keys.length) fail("duplicate key or option value");
}
/** Bounded presets only; entity metadata cannot supply CSS or arbitrary dimensions. */
export function parseChoiceCardsPresentation(
  raw: unknown,
): ChoiceCardsPresentation | undefined {
  if (raw === undefined) return undefined;
  const value = object(raw);
  if (
    Object.keys(value).some(
      (k) => !["layout", "optionColumns", "density"].includes(k),
    )
  )
    fail("unsupported choice presentation property");
  const layout = value.layout === undefined ? "stacked" : value.layout;
  const optionColumns =
    value.optionColumns === undefined
      ? layout === "grid"
        ? 2
        : 1
      : value.optionColumns;
  const density = value.density === undefined ? "comfortable" : value.density;
  if (layout !== "stacked" && layout !== "grid") fail("choice layout");
  if (optionColumns !== 1 && optionColumns !== 2) fail("choice columns");
  if (density !== "compact" && density !== "comfortable")
    fail("choice density");
  if (layout === "stacked" && optionColumns !== 1)
    fail("stacked choices require one column");
  return { layout, optionColumns, density } as ChoiceCardsPresentation;
}
export function parseEntityIntakeSurfaces(
  raw: unknown,
): readonly EntityIntakeSurfaceV1[] {
  if (!Array.isArray(raw) || raw.length > 32) fail("surfaces");
  const surfaces = (raw as unknown[]).map((candidate) => {
    const s = object(candidate);
    if (s.schemaVersion !== 1 || (s.columns !== 1 && s.columns !== 2))
      fail("version or columns");
    const sections = array(s.sections).map((candidate) => {
      const section = object(candidate);
      return {
        key: key(section.key),
        title: optionalText(section.title),
        description: optionalText(section.description),
        ...(section.populatedSummaryFields === undefined
          ? {}
          : {
              populatedSummaryFields: array(section.populatedSummaryFields).map(
                (v) =>
                  /^[a-zA-Z][a-zA-Z0-9_]{0,126}$/.test(text(v)) &&
                  !["constructor", "prototype", "__proto__"].includes(String(v))
                    ? String(v)
                    : fail("summary field"),
              ),
            }),
        ...(section.header === undefined
          ? {}
          : {
              header: (() => {
                const h = object(section.header);
                if (
                  h.style !== "accent" ||
                  Object.keys(h).some((k) => !["style", "icon"].includes(k))
                )
                  fail("section header");
                return { style: "accent" as const, icon: key(h.icon) };
              })(),
            }),
        ...(section.collapsible === undefined
          ? {}
          : {
              collapsible:
                typeof section.collapsible === "boolean"
                  ? section.collapsible
                  : fail("section collapsible"),
            }),
        ...(section.columns === undefined
          ? {}
          : {
              columns: (() => {
                if (
                  typeof section.columns !== "number" ||
                  !Number.isInteger(section.columns) ||
                  section.columns < 1 ||
                  section.columns > 12
                )
                  fail("section columns");
                return Number(section.columns);
              })(),
            }),
        fields: array(section.fields).map((candidate): IntakeSurfaceField => {
          const f = object(candidate);
          if (f.control === "input" || f.control === "repeatableGroup")
            return parseIntakeDataField(f);
          if (f.control === "entityLookup") return parseEntityLookupField(f);
          if (f.control !== "choiceCards" || typeof f.required !== "boolean")
            fail("control or required");
          const options = array(f.options).map((candidate) => {
            const o = object(candidate);
            const availableWhen =
              o.availableWhen === undefined
                ? undefined
                : parseIntakeCondition(o.availableWhen);
            const unavailableReason = optionalText(o.unavailableReason);
            if (availableWhen && !unavailableReason)
              fail("unavailable reason required");
            return {
              value: key(o.value),
              label: text(o.label),
              description: optionalText(o.description),
              availableWhen,
              unavailableReason,
            };
          });
          unique(options.map((o) => o.value));
          const presentation = parseChoiceCardsPresentation(f.presentation);
          return {
            key: key(f.key),
            control: "choiceCards" as const,
            ...(presentation ? { presentation } : {}),
            label: text(f.label),
            helpText: optionalText(f.helpText),
            required: f.required as boolean,
            visibleWhen:
              f.visibleWhen === undefined
                ? undefined
                : parseIntakeCondition(f.visibleWhen),
            options,
          };
        }),
      };
    });
    unique(sections.map((s) => s.key));
    const fields = sections.flatMap((s) => s.fields);
    if (fields.length > 64) fail("maximum 64 fields per surface");
    unique(fields.map((f) => f.key));
    unique(
      fields
        .filter(
          (f): f is IntakeDataField =>
            f.control === "input" || f.control === "repeatableGroup",
        )
        .map((f) => f.valueKey),
    );
    const keys = new Set(fields.map((f) => f.key));
    const dependencies = new Map(
      fields.map((f) => [
        f.key,
        [
          f.visibleWhen,
          ...(f.control === "input"
            ? (f.variants ?? []).map((v) => v.when)
            : f.control === "repeatableGroup" ? (f.itemFieldRules ?? []).map(rule => rule.when) : []),
          ...(f.control === "choiceCards"
            ? f.options.map((o) => o.availableWhen)
            : f.control === "entityLookup"
              ? f.lookup.actions.map((a) => a.visibleWhen)
              : []),
        ]
          .filter(Boolean)
          .map((c) => c!.field),
      ]),
    );
    for (const field of fields)
      if (field.control === "input") {
        const inputs = fields.filter(
          (f): f is Extract<typeof f, { control: "input" }> =>
            f.control === "input",
        );
        for (const name of [
          ...(field.referenceRules ? [field.referenceRules.field] : []),
          ...(field.lookup?.filterBy ?? []).map((b) => b.field),
          ...(field.lookup?.copyFields ?? []).map((b) => b.to),
          ...(field.clearOnChange?.fields ?? []),
        ])
          if (
            name === field.valueKey ||
            !inputs.some((f) => f.valueKey === name)
          )
            fail("invalid dependent input binding");
      }
    const visited = new Set<string>();
    const visit = (k: string, path: Set<string>) => {
      if (visited.has(k)) return;
      if (path.has(k)) fail("cyclic dependency");
      for (const dep of dependencies.get(k) ?? []) {
        if (!keys.has(dep)) fail(`unknown condition field ${dep}`);
        visit(dep, new Set([...path, k]));
      }
      visited.add(k);
    };
    fields.forEach((f) => visit(f.key, new Set()));
    return {
      schemaVersion: 1 as const,
      validationMessages: parseValidationMessages(s.validationMessages),
      key: key(s.key),
      title: text(s.title),
      ...(s.formLabels
        ? {
            formLabels: {
              ...(object(s.formLabels).editTitle === undefined
                ? {}
                : { editTitle: text(object(s.formLabels).editTitle) }),
              ...(object(s.formLabels).editDescription === undefined
                ? {}
                : {
                    editDescription: text(object(s.formLabels).editDescription),
                  }),
              ...(object(s.formLabels).close === undefined
                ? {}
                : { close: text(object(s.formLabels).close) }),
              ...(object(s.formLabels).draftStatus === undefined
                ? {}
                : { draftStatus: text(object(s.formLabels).draftStatus) }),
              ...(object(s.formLabels).notSaved === undefined
                ? {}
                : { notSaved: text(object(s.formLabels).notSaved) }),
              ...(object(s.formLabels).unsavedChanges === undefined
                ? {}
                : {
                    unsavedChanges: text(object(s.formLabels).unsavedChanges),
                  }),
              ...(object(s.formLabels).supplierRole === undefined
                ? {}
                : { supplierRole: text(object(s.formLabels).supplierRole) }),
              ...(object(s.formLabels).customerRole === undefined
                ? {}
                : { customerRole: text(object(s.formLabels).customerRole) }),
              ...(object(s.formLabels).chooseRoleHint === undefined
                ? {}
                : {
                    chooseRoleHint: text(object(s.formLabels).chooseRoleHint),
                  }),
              ...(object(s.formLabels).savedAt === undefined
                ? {}
                : { savedAt: text(object(s.formLabels).savedAt) }),
              ...(object(s.formLabels).copyReference === undefined
                ? {}
                : { copyReference: text(object(s.formLabels).copyReference) }),
              ...(object(s.formLabels).referenceCopied === undefined
                ? {}
                : {
                    referenceCopied: text(object(s.formLabels).referenceCopied),
                  }),
              ...(object(s.formLabels).copyFailed === undefined
                ? {}
                : { copyFailed: text(object(s.formLabels).copyFailed) }),
              ...(object(s.formLabels).changesNotSaved === undefined
                ? {}
                : {
                    changesNotSaved: text(object(s.formLabels).changesNotSaved),
                  }),
              ...(object(s.formLabels).requestTitle === undefined
                ? {}
                : { requestTitle: text(object(s.formLabels).requestTitle) }),
              continue: text(object(s.formLabels).continue),
              submit: text(object(s.formLabels).submit),
              ...(object(s.formLabels).saveDraft === undefined
                ? {}
                : { saveDraft: text(object(s.formLabels).saveDraft) }),
              ...(object(s.formLabels).draftSaved === undefined
                ? {}
                : { draftSaved: text(object(s.formLabels).draftSaved) }),
              ...(object(s.formLabels).savingDraft === undefined
                ? {}
                : { savingDraft: text(object(s.formLabels).savingDraft) }),
              ...(object(s.formLabels).draftRetry === undefined
                ? {}
                : { draftRetry: text(object(s.formLabels).draftRetry) }),
              ...(object(s.formLabels).incompatibleDraft === undefined
                ? {}
                : {
                    incompatibleDraft: text(
                      object(s.formLabels).incompatibleDraft,
                    ),
                  }),
            },
          }
        : {}),
      columns: s.columns as 1 | 2,
      sections,
    };
  });
  unique(surfaces.map((s) => s.key));
  const visitSurface = (surface: EntityIntakeSurfaceV1, path: string[]) => {
    if (path.includes(surface.key) || path.length > 3)
      fail("cyclic or deeply nested item surface");
    for (const field of surface.sections.flatMap((s) => s.fields))
      if (field.control === "repeatableGroup") {
        const item = surfaces.find((s) => s.key === field.itemSurfaceKey);
        if (!item) fail("missing item surface");
        for (const rule of field.itemFieldRules ?? [])
          for (const key of rule.fields)
            if (!item!.sections.flatMap(s => s.fields).some(f => f.control === "input" && f.valueKey === key))
              fail("item field rule must reference an input");
        if (
          field.primaryField &&
          !item!.sections
            .flatMap((s) => s.fields)
            .some(
              (f) =>
                f.control === "input" &&
                f.valueKey === field.primaryField &&
                f.widget === "checkbox",
            )
        )
          fail("primary field must be a checkbox");
        for (const binding of field.presentation?.summary ?? []) {
          const target = item!.sections
            .flatMap((s) => s.fields)
            .find(
              (f) =>
                (f.control === "input" || f.control === "repeatableGroup") &&
                f.valueKey === binding.field,
            );
          if (
            !target ||
            (binding.format === "count" || binding.format === "primary"
              ? target.control !== "repeatableGroup"
              : target.control !== "input")
          )
            fail("collection summary binding must match an item field");
        }
        for (const titleField of field.presentation?.titleFields ?? []) {
          if (
            !field.presentation?.summary.some(
              (s) =>
                s.field === titleField &&
                s.format !== "count" &&
                s.format !== "primary",
            )
          )
            fail("collection title must reference a scalar summary field");
        }
        visitSurface(item!, [...path, surface.key]);
      }
  };
  surfaces.forEach((s) => visitSurface(s, []));
  const size = (surface: EntityIntakeSurfaceV1): number =>
    surface.sections
      .flatMap((s) => s.fields)
      .reduce(
        (total, f) =>
          total +
          (f.control === "repeatableGroup"
            ? f.maxItems *
              size(surfaces.find((s) => s.key === f.itemSurfaceKey)!)
            : 1),
        0,
      );
  if (surfaces.some((s) => size(s) > 10000))
    fail("expanded form exceeds field budget");
  return surfaces;
}
/** Produces only active, valid answers. Never forwards arbitrary or hidden keys. */
export function intakeSurfaceValues(
  surface: EntityIntakeSurfaceV1,
  answers: Readonly<Record<string, unknown>>,
) {
  const fields = surface.sections
    .flatMap((s) => s.fields)
    .filter((f): f is IntakeChoiceField => f.control === "choiceCards");
  let values: Record<string, string> = Object.fromEntries(
    fields
      .filter((f) => typeof answers[f.key] === "string")
      .map((f) => [f.key, answers[f.key] as string]),
  );
  for (let i = 0; i <= fields.length; i++) {
    const next = Object.fromEntries(
      fields
        .filter(
          (f) =>
            intakeConditionMatches(f.visibleWhen, values) &&
            f.options.some(
              (o) =>
                o.value === values[f.key] &&
                intakeConditionMatches(o.availableWhen, values),
            ),
        )
        .map((f) => [f.key, values[f.key]!]),
    );
    if (JSON.stringify(next) === JSON.stringify(values)) return next;
    values = next;
  }
  return values;
}
export function validateIntakeSurface(
  surface: EntityIntakeSurfaceV1,
  answers: Readonly<Record<string, unknown>>,
) {
  const values = intakeSurfaceValues(surface, answers);
  return Object.fromEntries(
    surface.sections
      .flatMap((s) => s.fields)
      .flatMap((f) => {
        if (f.control !== "choiceCards") return [];
        if (!intakeConditionMatches(f.visibleWhen, values)) return [];
        if (answers[f.key] && !values[f.key])
          return [
            [
              f.key,
              "This selection is no longer available. Choose another option.",
            ],
          ];
        return f.required && !values[f.key]
          ? [[f.key, `Select ${f.label.toLowerCase()}.`]]
          : [];
      }),
  );
}
