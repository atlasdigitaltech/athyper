import { parseEntityIntakeSurfaces } from "./intake-surface";
type Row = Record<string, any>;
/** Explicit opt-in on existing form surfaces; runtime inputs never enter record storage. */
export function compileEntityIntakeSurfaces(
  native: Readonly<Record<string, unknown>>,
) {
  const rows = (key: string): Row[] => {
    const v = native[key] ?? [];
    if (
      !Array.isArray(v) ||
      v.some((r) => !r || typeof r !== "object" || Array.isArray(r))
    )
      throw Error(`INTAKE_SURFACE_BRANCH:${key}`);
    return v.filter((r) => r.status !== "deprecated");
  };
  const fields = rows("fields"),
    sections = rows("surfaceSections"),
    bindings = rows("surfaceFieldBindings");
  const defaults = rows("surfaces").filter(
    (s) => s.layoutConfig?.entityValidationMessages !== undefined,
  );
  if (defaults.length > 1) throw Error("DUPLICATE_ENTITY_VALIDATION_MESSAGES");
  return parseEntityIntakeSurfaces(
    rows("surfaces")
      .filter((s) => s.layoutConfig?.renderer === "intake")
      .map((s) => {
        if (s.surfaceKind !== "form") throw Error("INTAKE_FORM_REQUIRED");
        const members = sections.filter((v) => v.entitySurfaceId === s.id);
        const ownBindings = bindings.filter((b) => b.entitySurfaceId === s.id);
        if (
          ownBindings.some(
            (b) => !members.some((m) => m.id === b.entitySurfaceSectionId),
          )
        )
          throw Error("INTAKE_SECTION_REFERENCE");
        const ordered = (values: Row[]) => {
          if (
            values.some(
              (v) => !Number.isInteger(v.position) || v.position < 0,
            ) ||
            new Set(values.map((v) => v.position)).size !== values.length
          )
            throw Error("INTAKE_SURFACE_POSITION");
          return [...values].sort((a, b) => a.position - b.position);
        };
        return {
          schemaVersion: 1,
          key: s.surfaceKey,
          title: s.title,
          formLabels: s.layoutConfig.formLabels,
          validationMessages: {
            ...defaults[0]?.layoutConfig.entityValidationMessages,
            ...s.layoutConfig.validationMessages,
          },
          columns: s.layoutConfig.columns ?? 1,
          sections: ordered(members).map((section) => {
            if (
              (section.columnCount &&
                (section.columnCount < 1 || section.columnCount > 12)) ||
              section.parentSectionId ||
              (section.sectionKind && section.sectionKind !== "section")
            )
              throw Error("INTAKE_SECTION_UNSUPPORTED");
            return {
              key: section.sectionKey,
              title: section.title,
              description: section.description,
              header: section.layoutConfig?.header,
              populatedSummaryFields:
                section.layoutConfig?.populatedSummaryFields,
              ...(section.collapsible ? { collapsible: true } : {}),
              columns: section.columnCount ?? 1,
              fields: ordered(
                ownBindings.filter(
                  (b) => b.entitySurfaceSectionId === section.id,
                ),
              ).map((b) => {
                const field = fields.find((f) => f.id === b.entityFieldId);
                if (["input", "repeatable_group"].includes(b.widgetKey)) {
                  if (
                    !field ||
                    field.valueOrigin !== "runtime" ||
                    field.writeMode !== "mutable" ||
                    field.storagePath ||
                    b.editabilityRule
                  )
                    throw Error("INTAKE_INPUT_MUST_BE_RUNTIME");
                  const expectedType =
                    b.widgetKey === "repeatable_group"
                      ? "json"
                      : b.displayConfig?.widget === "checkbox"
                        ? "boolean"
                        : b.displayConfig?.widget === "integer"
                          ? "integer"
                          : b.displayConfig?.widget === "decimal"
                            ? "decimal"
                            : "string";
                  if (
                    field.dataType !== expectedType ||
                    field.typeConfig?.kind !== expectedType ||
                    (field.cardinality && field.cardinality !== "one")
                  )
                    throw Error("INTAKE_INPUT_TYPE_MISMATCH");
                  if (field.validationSpec || field.defaultSpec)
                    throw Error("INTAKE_INPUT_UNSUPPORTED_FIELD_RULES");
                  return {
                    ...b.displayConfig,
                    key: field.fieldKey,
                    control:
                      b.widgetKey === "input" ? "input" : "repeatableGroup",
                    label: b.labelOverride ?? field.fieldKey,
                    helpText: b.helpText,
                    placeholder: b.placeholder,
                    columnSpan: b.columnSpan ?? 12,
                    visibleWhen: b.visibilityRule,
                  };
                }
                if (
                  !field ||
                  field.valueOrigin !== "runtime" ||
                  field.writeMode !== "mutable" ||
                  field.storagePath ||
                  field.dataType !== "string" ||
                  field.typeConfig?.kind !== "string" ||
                  (field.cardinality && field.cardinality !== "one")
                )
                  throw Error("INTAKE_RUNTIME_CHOICE_FIELD_REQUIRED");
                if (
                  (b.columnSpan && b.columnSpan !== 12) ||
                  !["choice_cards", "entity_lookup"].includes(b.widgetKey) ||
                  b.editabilityRule
                )
                  throw Error("INTAKE_WIDGET_UNSUPPORTED");
                if (b.widgetKey === "entity_lookup") {
                  if (field.validationSpec)
                    throw Error("INTAKE_LOOKUP_VALIDATION_UNSUPPORTED");
                  return {
                    key: field.fieldKey,
                    control: "entityLookup",
                    label: b.labelOverride ?? field.fieldKey,
                    helpText: b.helpText,
                    required: b.displayConfig?.required ?? false,
                    visibleWhen: b.visibilityRule,
                    lookup: b.displayConfig?.lookup,
                  };
                }
                const rules = field.validationSpec?.rules;
                if (
                  field.validationSpec?.schema_version !== 1 ||
                  !Array.isArray(rules) ||
                  rules.length !== 1 ||
                  rules[0].kind !== "allowed_values"
                )
                  throw Error("INTAKE_ALLOWED_VALUES_REQUIRED");
                const allowed = rules[0].parameters?.values,
                  options = b.displayConfig?.options;
                if (
                  !Array.isArray(allowed) ||
                  !Array.isArray(options) ||
                  allowed.length !== options.length ||
                  new Set(allowed).size !== allowed.length ||
                  options.some((o: Row) => !allowed.includes(o.value))
                )
                  throw Error("INTAKE_OPTION_DOMAIN_MISMATCH");
                return {
                  key: field.fieldKey,
                  control: "choiceCards",
                  ...(["layout", "optionColumns", "density"].some((key) =>
                    Object.hasOwn(b.displayConfig ?? {}, key),
                  )
                    ? {
                        presentation: Object.fromEntries(
                          ["layout", "optionColumns", "density"]
                            .filter((key) =>
                              Object.hasOwn(b.displayConfig, key),
                            )
                            .map((key) => [key, b.displayConfig[key]]),
                        ),
                      }
                    : {}),
                  label: b.labelOverride ?? field.fieldKey,
                  helpText: b.helpText,
                  required: b.displayConfig?.required ?? false,
                  visibleWhen: b.visibilityRule,
                  options,
                };
              }),
            };
          }),
        };
      }),
  );
}
