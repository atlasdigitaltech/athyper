import type { IntakeInputField, IntakeRepeatableField } from "./intake-data";
import { validateDataInput, DataValidationError } from "./validation-messages";
import { intakeConditionMatches } from "./intake";
import type { EntityIntakeSurfaceV1, IntakeDataField } from "./intake-surface";
export type DataAnswers = Readonly<Record<string, unknown>>;
const fieldsOf = (surface: EntityIntakeSurfaceV1) =>
  surface.sections
    .flatMap((s) => s.fields)
    .filter(
      (f): f is IntakeDataField =>
        f.control === "input" || f.control === "repeatableGroup",
    );
export function dataFieldVisible(
  field: IntakeDataField,
  surface: EntityIntakeSurfaceV1,
  answers: DataAnswers,
) {
  const fields = fieldsOf(surface);
  let values: Record<string, unknown> = Object.fromEntries(
    fields.map((f) => [f.key, answers[f.valueKey]]),
  );
  for (let i = 0; i <= fields.length; i++) {
    const next = Object.fromEntries(
      fields
        .filter((f) => intakeConditionMatches(f.visibleWhen, values))
        .map((f) => [f.key, answers[f.valueKey]]),
    );
    if (Object.keys(next).length === Object.keys(values).length)
      return intakeConditionMatches(field.visibleWhen, next);
    values = next;
  }
  return false;
}
/** Derive scalar values only from the selected reference option declared by metadata. */
export function resolveDataAnswers(
  surface: EntityIntakeSurfaceV1,
  supplied: DataAnswers,
): DataAnswers {
  const answers: Record<string, unknown> = { ...supplied };
  for (const field of fieldsOf(surface)) {
    if (field.control !== "input" || !field.referenceRules?.value) continue;
    const rules = field.referenceRules;
    const source = fieldsOf(surface).find(
      (f) => f.control === "input" && f.valueKey === rules.field,
    );
    const option =
      source?.control === "input"
        ? source.lookup?.options?.find((o) => o.value === supplied[rules.field])
        : undefined;
    const value = option?.data?.[rules.value!];
    if (typeof value === "string" && value) answers[field.valueKey] = value;
  }
  return answers;
}
/** Resolve declared variants and dependent options identically for rendering and validation. */
export function resolveDataInput(
  field: IntakeInputField,
  surface: EntityIntakeSurfaceV1,
  answers: DataAnswers,
): IntakeInputField {
  let result = field;
  for (const variant of field.variants ?? [])
    if (
      dataFieldVisible(
        { ...field, visibleWhen: variant.when },
        surface,
        answers,
      )
    ) {
      const { when, ...overrides } = variant;
      result = {
        ...result,
        ...overrides,
        format:
          overrides.format === "none"
            ? undefined
            : (overrides.format ?? result.format),
      };
    }
  if (field.referenceRules) {
    const rules = field.referenceRules;
    const source = fieldsOf(surface).find(
      (f) => f.control === "input" && f.valueKey === rules.field,
    );
    const option =
      source?.control === "input"
        ? source.lookup?.options?.find((o) => o.value === answers[rules.field])
        : undefined;
    if (option?.data) {
      const overrides: Record<string, string> = {};
      for (const name of [
        "label",
        "pattern",
        "placeholder",
        "helpText",
      ] as const) {
        const property = rules[name];
        const value = property ? option.data[property] : undefined;
        if (typeof value === "string" && (name !== "label" || value))
          overrides[name] = value;
      }
      result = { ...result, ...overrides };
      const widget = rules.widget ? option.data[rules.widget] : undefined;
      if (widget === "hidden" || widget === "text" || widget === "select")
        result = { ...result, widget };
      const required = rules.required ? option.data[rules.required] : undefined;
      if (typeof required === "boolean") result = { ...result, required };
    }
  }
  if (result.lookup?.filterBy?.length) {
    const options = result.lookup.options ?? [];
    const eligible = options.filter((option) =>
      result.lookup!.filterBy!.every((binding) => {
        const expected = answers[binding.field],
          actual = option.data?.[binding.property];
        return (
          expected !== undefined &&
          expected !== "" &&
          (Array.isArray(actual)
            ? actual.includes(String(expected))
            : actual === expected)
        );
      }),
    );
    result = {
      ...result,
      lookup: {
        ...result.lookup,
        options:
          eligible.length || !result.lookup.fallbackToAll ? eligible : options,
      },
    };
  }
  return result;
}
export function changedDataInput(
  field: IntakeInputField,
  answers: DataAnswers,
  value: unknown,
): DataAnswers {
  const next: Record<string, unknown> = { ...answers, [field.valueKey]: value };
  if (value === answers[field.valueKey]) return next;
  for (const key of field.clearOnChange?.fields ?? []) next[key] = "";
  const option = field.lookup?.options?.find((o) => o.value === value);
  for (const binding of field.lookup?.copyFields ?? [])
    next[binding.to] = option?.data?.[binding.from] ?? "";
  return next;
}
/** Confirm only when populated dependent values actually change after reference derivation. */
export function dataInputChangeRequiresConfirmation(
  field: IntakeInputField,
  surface: EntityIntakeSurfaceV1,
  supplied: DataAnswers,
  value: unknown,
): boolean {
  const before = resolveDataAnswers(surface, supplied);
  if (value === before[field.valueKey]) return false;
  const after = resolveDataAnswers(
    surface,
    changedDataInput(field, before, value),
  );
  return Boolean(
    field.clearOnChange?.fields.some(
      (key) =>
        before[key] !== undefined &&
        before[key] !== null &&
        before[key] !== "" &&
        before[key] !== false &&
        before[key] !== after[key],
    ),
  );
}
export function dataSurfaceDefaults(
  surface: EntityIntakeSurfaceV1,
  surfaces: readonly EntityIntakeSurfaceV1[],
): DataAnswers {
  return Object.fromEntries(
    fieldsOf(surface).map((f) => [
      f.valueKey,
      f.control === "input"
        ? (f.defaultValue ?? (f.widget === "checkbox" ? false : ""))
        : Array.from({ length: f.minItems }, (_, index) => ({
            ...dataSurfaceDefaults(
              dataItemSurface(f.itemSurfaceKey, surfaces),
              surfaces,
            ),
            key: crypto.randomUUID(),
            ...(f.primaryField ? { [f.primaryField]: index === 0 } : {}),
          })),
    ]),
  );
}
export function dataItemSurface(
  key: string,
  surfaces: readonly EntityIntakeSurfaceV1[],
) {
  const s = surfaces.find((s) => s.key === key);
  if (!s) throw Error(`Missing item surface: ${key}`);
  return s;
}
/** Apply parent conditions without changing the shared item surface. */
export function resolveDataItemSurface(
  field: IntakeRepeatableField,
  surface: EntityIntakeSurfaceV1,
  answers: DataAnswers,
  surfaces: readonly EntityIntakeSurfaceV1[],
): EntityIntakeSurfaceV1 {
  const item = dataItemSurface(field.itemSurfaceKey, surfaces);
  const rules = field.itemFieldRules?.filter(rule => dataFieldVisible({...field, visibleWhen: rule.when}, surface, answers));
  if (!rules?.length) return item;
  return {...item, sections: item.sections.map(section => ({...section, fields: section.fields.map(input => {
    if (input.control !== "input") return input;
    const rule = [...rules].reverse().find(rule => rule.fields.includes(input.valueKey));
    return rule ? {...input, required: rule.required} : input;
  })}))};
}
/** Strip hidden/unknown values and validate declared fields before invoking any business adapter. */
export function dataSurfaceValues(
  surface: EntityIntakeSurfaceV1,
  surfaces: readonly EntityIntakeSurfaceV1[],
  answers: DataAnswers,
  mode: "submit" | "draft" = "submit",
): DataAnswers {
  answers = resolveDataAnswers(surface, answers);
  const result: Record<string, unknown> = {};
  for (const raw of fieldsOf(surface)) {
    if (!dataFieldVisible(raw, surface, answers)) continue;
    const f =
      raw.control === "input" ? resolveDataInput(raw, surface, answers) : raw;
    const v = answers[f.valueKey];
    if (f.control === "repeatableGroup") {
      if (
        !Array.isArray(v) ||
        (mode !== "draft" && v.length < f.minItems) ||
        v.length > f.maxItems
      )
        throw Error(
          `${f.label}: select between ${f.minItems} and ${f.maxItems} items.`,
        );
      const keys = new Set<string>();
      const rows = v.map((row) => {
        if (
          !row ||
          typeof row !== "object" ||
          typeof row.key !== "string" ||
          !row.key ||
          keys.has(row.key)
        )
          throw Error(`${f.label}: invalid item identity.`);
        keys.add(row.key);
        return {
          ...dataSurfaceValues(
            resolveDataItemSurface(f, surface, answers, surfaces),
            surfaces,
            row,
            mode,
          ),
          key: row.key,
        };
      });
      if (
        mode !== "draft" &&
        f.primaryField &&
        rows.length &&
        rows.filter((row) => (row as DataAnswers)[f.primaryField!] === true)
          .length !== 1
      )
        throw Error(`${f.label}: choose one primary item.`);
      for (const rule of mode === "draft" ? [] : (f.requiredItemValues ?? [])) {
        if (
          rows.filter((row) => (row as DataAnswers)[rule.field] === rule.value)
            .length < rule.minItems
        )
          throw Error(rule.message);
      }
      result[f.valueKey] = rows;
      continue;
    }
    const issue = validateDataInput(
      mode === "draft" ? { ...f, required: false } : f,
      v,
      surface.validationMessages,
    );
    if (issue) throw new DataValidationError([issue]);
    if (f.widget === "checkbox") {
      result[f.valueKey] = v;
      continue;
    }
    if (v === undefined || v === null || v === "") {
      result[f.valueKey] = "";
      continue;
    }
    let value = String(v).trim();
    if (f.format === "iban") value = value.replace(/\s/g, "").toUpperCase();
    if (f.normalize === "uppercase") value = value.toUpperCase();
    if (f.normalize === "lowercase") value = value.toLowerCase();
    result[f.valueKey] = ["integer", "decimal"].includes(f.widget)
      ? Number(value)
      : value;
  }
  return result;
}
