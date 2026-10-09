import { parseDetailFieldRenderer } from "./detail-field-renderer";
export * from "./detail-field-renderer";
export * from "./form-presentation";
import {
  parseEntityFormSections,
  type EntityFormSectionV1,
} from "./form-sections";
export * from "./form-sections";
import {
  parseResolvedEntityReferences,
  type ResolvedEntityReferenceV1,
} from "./reference-lookup";
export * from "./runtime-values";
import {
  parseEntityRecordPresentation,
  type EntityRecordPresentationV1,
} from "./record-presentation";
export * from "./section-component";
import {
  parsePresentationLocalization,
  type EntityPresentationLocalizationV1,
} from "./presentation-localization";
export * from "./record-presentation";
export * from "./governed-workflow";

export type EntitySurfaceFieldKind =
  | "string"
  | "text"
  | "integer"
  | "decimal"
  | "money"
  | "boolean"
  | "date"
  | "datetime"
  | "uuid"
  | "enum"
  | "reference"
  | "json";
export interface EntitySurfaceFieldV1 {
  readonly rendererKey?: "text";
  readonly helpText?: string;
  readonly referenceLookup?: Readonly<{ dependencies: readonly string[] }>;
  readonly key: string;
  readonly label: string;
  readonly kind: EntitySurfaceFieldKind;
  readonly required: boolean;
  readonly readOnly: boolean;
  readonly options?: readonly Readonly<{ value: string; label: string }>[];
}
export interface EntitySurfaceRevisionV1 {
  readonly release: number;
  readonly descriptorHash: string;
  readonly surfaceHash: string;
}
export interface EntityFormDescriptorV1 {
  readonly sections?: readonly EntityFormSectionV1[];
  readonly localizedLabels?: EntityPresentationLocalizationV1;
  readonly schema: "athyper.entity-form-descriptor/1";
  readonly plane: "studio" | "neon" | "mesh";
  readonly entity: Readonly<{
    code: string;
    label: string;
    pluralLabel: string;
  }>;
  readonly revision: EntitySurfaceRevisionV1;
  readonly mode: "create" | "edit";
  readonly pageKind: "create" | "edit";
  readonly title: string;
  readonly description: string;
  readonly fields: readonly EntitySurfaceFieldV1[];
  readonly submit: Readonly<{ operation: "create" | "patch"; label: string }>;
}
export interface EntityDetailDescriptorV1 {
  readonly referenceSummaryFields?: readonly string[];
  readonly relationshipCapabilities?: Readonly<
    Record<string, { readonly create: boolean }>
  >;
  readonly localizedLabels?: EntityPresentationLocalizationV1;
  readonly activity?: boolean;
  readonly collaboration?: readonly ("comments" | "attachments")[];
  readonly presentation?: EntityRecordPresentationV1;
  readonly schema: "athyper.entity-detail-descriptor/1";
  readonly plane: "studio" | "neon" | "mesh";
  readonly entity: Readonly<{
    code: string;
    label: string;
    pluralLabel: string;
  }>;
  readonly revision: EntitySurfaceRevisionV1;
  readonly pageKind: "detail";
  readonly titleField: string;
  readonly fields: readonly EntitySurfaceFieldV1[];
  readonly actions: readonly Readonly<{
    code: string;
    label: string;
    kind: "edit" | "transition";
  }>[];
}
export interface EntityRecordV1 {
  readonly references?: Readonly<Record<string, ResolvedEntityReferenceV1>>;
  readonly displayValues?: Readonly<Record<string, string>>;
  readonly id: string;
  readonly version?: number;
  readonly values: Readonly<Record<string, unknown>>;
}

const codePattern = /^[a-z][a-z0-9_.-]{0,126}$/;
export function parseEntityFormDescriptor(
  value: unknown,
): EntityFormDescriptorV1 {
  const root = object(value, "form descriptor");
  if (root.schema !== "athyper.entity-form-descriptor/1")
    fail("form descriptor schema");
  const mode = oneOf(root.mode, ["create", "edit"] as const, "mode");
  const submit = object(root.submit, "submit");
  return Object.freeze({
    schema: "athyper.entity-form-descriptor/1",
    ...(root.localizedLabels === undefined
      ? {}
      : {
          localizedLabels: parsePresentationLocalization(root.localizedLabels),
        }),
    plane: oneOf(root.plane, ["studio", "neon", "mesh"] as const, "plane"),
    entity: entity(root.entity),
    revision: revision(root.revision),
    mode,
    pageKind: mode,
    title: text(root.title, "title", 160),
    description: text(root.description, "description", 500),
    sections: parseEntityFormSections(
      root.sections,
      fields(root.fields).map((field) => field.key),
    ),
    fields: fields(root.fields),
    submit: Object.freeze({
      operation: oneOf(
        submit.operation,
        ["create", "patch"] as const,
        "submit.operation",
      ),
      label: text(submit.label, "submit.label", 80),
    }),
  });
}
export function parseEntityDetailDescriptor(
  value: unknown,
): EntityDetailDescriptorV1 {
  const root = object(value, "detail descriptor");
  if (root.schema !== "athyper.entity-detail-descriptor/1")
    fail("detail descriptor schema");
  return Object.freeze({
    schema: "athyper.entity-detail-descriptor/1",
    ...(root.referenceSummaryFields === undefined
      ? {}
      : {
          referenceSummaryFields: Object.freeze(
            array(root.referenceSummaryFields, "reference summary fields").map(
              (key) => code(key, "reference summary field"),
            ),
          ),
        }),
    ...(root.relationshipCapabilities === undefined
      ? {}
      : {
          relationshipCapabilities: Object.freeze(
            Object.fromEntries(
              Object.entries(
                object(
                  root.relationshipCapabilities,
                  "relationshipCapabilities",
                ),
              ).map(([key, value]) => [
                code(key, "relationship key"),
                Object.freeze({
                  create: boolean(
                    object(value, "relationship capability").create,
                    "relationship create",
                  ),
                }),
              ]),
            ),
          ),
        }),
    ...(root.localizedLabels === undefined
      ? {}
      : {
          localizedLabels: parsePresentationLocalization(root.localizedLabels),
        }),
    ...(root.activity === undefined ? {} : { activity: bool(root.activity) }),
    ...(root.collaboration === undefined
      ? {}
      : {
          collaboration: Object.freeze([
            ...new Set(
              array(root.collaboration, "collaboration").map((value) =>
                oneOf(
                  value,
                  ["comments", "attachments"] as const,
                  "collaboration kind",
                ),
              ),
            ),
          ]),
        }),
    plane: oneOf(root.plane, ["studio", "neon", "mesh"] as const, "plane"),
    entity: entity(root.entity),
    revision: revision(root.revision),
    pageKind: "detail",
    ...(root.presentation === undefined
      ? {}
      : { presentation: parseEntityRecordPresentation(root.presentation) }),
    titleField: code(root.titleField, "titleField"),
    fields: fields(root.fields),
    actions: Object.freeze(
      array(root.actions, "actions").map((value, index) => {
        const item = object(value, `actions[${index}]`);
        return Object.freeze({
          code: code(item.code, `actions[${index}].code`),
          label: text(item.label, `actions[${index}].label`, 80),
          kind: oneOf(
            item.kind,
            ["edit", "transition"] as const,
            `actions[${index}].kind`,
          ),
        });
      }),
    ),
  });
}
export function parseEntityRecord(value: unknown): EntityRecordV1 {
  const root = object(value, "record result"),
    rawId = root.id,
    values = object(root.values, "record result.values");
  if (typeof rawId !== "string" && typeof rawId !== "number")
    fail("record identity");
  const versionValue = root.version,
    version =
      typeof versionValue === "number" &&
      Number.isInteger(versionValue) &&
      versionValue >= 0
        ? versionValue
        : undefined;
  return Object.freeze({
    id: String(rawId),
    ...(version === undefined ? {} : { version }),
    values: Object.freeze({ ...values }),
    ...(root.references === undefined
      ? {}
      : { references: parseResolvedEntityReferences(root.references, values) }),
    ...(root.displayValues === undefined
      ? {}
      : {
          displayValues: Object.freeze(
            Object.fromEntries(
              Object.entries(object(root.displayValues, "display values"))
                .filter(([key]) => Object.hasOwn(values, key))
                .map(([key, value]) => [
                  key,
                  text(value, "display value", 500),
                ]),
            ),
          ),
        }),
  });
}
function entity(value: unknown) {
  const item = object(value, "entity");
  return Object.freeze({
    code: code(item.code, "entity.code"),
    label: text(item.label, "entity.label", 120),
    pluralLabel: text(item.pluralLabel, "entity.pluralLabel", 120),
  });
}
function revision(value: unknown): EntitySurfaceRevisionV1 {
  const item = object(value, "revision");
  const release = item.release;
  if (!Number.isInteger(release) || Number(release) < 1)
    fail("revision.release");
  return Object.freeze({
    release: Number(release),
    descriptorHash: hash(item.descriptorHash, "revision.descriptorHash"),
    surfaceHash: hash(item.surfaceHash, "revision.surfaceHash"),
  });
}
function fields(value: unknown): readonly EntitySurfaceFieldV1[] {
  const seen = new Set<string>();
  return Object.freeze(
    array(value, "fields").map((candidate, index) => {
      const item = object(candidate, `fields[${index}]`),
        key = code(item.key, `fields[${index}].key`);
      if (seen.has(key)) fail(`duplicate field ${key}`);
      seen.add(key);
      const options =
        item.options === undefined
          ? undefined
          : Object.freeze(
              array(item.options, `fields[${index}].options`).map(
                (candidateOption, optionIndex) => {
                  const option = object(
                    candidateOption,
                    `fields[${index}].options[${optionIndex}]`,
                  );
                  return Object.freeze({
                    value: text(option.value, "option.value", 200),
                    label: text(option.label, "option.label", 200),
                  });
                },
              ),
            );
      const referenceLookup =
        item.referenceLookup === undefined
          ? undefined
          : Object.freeze({
              dependencies: Object.freeze(
                array(
                  object(item.referenceLookup, "referenceLookup").dependencies,
                  "referenceLookup.dependencies",
                ).map((v) => code(v, "reference dependency")),
              ),
            });
      return Object.freeze({
        ...(item.rendererKey === undefined
          ? {}
          : {
              rendererKey: parseDetailFieldRenderer(
                item.rendererKey,
                item.kind,
              ),
            }),
        ...(referenceLookup ? { referenceLookup } : {}),
        key,
        ...(item.helpText === undefined
          ? {}
          : { helpText: text(item.helpText, "field help", 500) }),
        label: text(item.label, `fields[${index}].label`, 120),
        kind: oneOf(
          item.kind,
          [
            "string",
            "text",
            "integer",
            "decimal",
            "money",
            "boolean",
            "date",
            "datetime",
            "uuid",
            "enum",
            "reference",
            "json",
          ] as const,
          `fields[${index}].kind`,
        ),
        required: boolean(item.required, `fields[${index}].required`),
        readOnly: boolean(item.readOnly, `fields[${index}].readOnly`),
        ...(options ? { options } : {}),
      });
    }),
  );
}
function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(name);
  return value as Record<string, unknown>;
}
function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(name);
  return value;
}
function text(value: unknown, name: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(name);
  return value.trim();
}
function code(value: unknown, name: string): string {
  const result = text(value, name, 127);
  if (!codePattern.test(result)) fail(name);
  return result;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean") fail(name);
  return value;
}
function hash(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) fail(name);
  return value;
}
function oneOf<const T extends readonly unknown[]>(
  value: unknown,
  choices: T,
  name: string,
): T[number] {
  if (!choices.includes(value)) fail(name);
  return value as T[number];
}
function fail(name: string): never {
  throw new TypeError(`${name} is invalid`);
}

export * from "./record-360-panel";

export * from "./related-presentation";
export * from "./access-decision";

export * from "./intake";
export * from "./intake-operation";
export * from "./intake-surface";

export * from "./intake-surface-authoring";

export * from "./entity-lookup";

export * from "./lookup-options";

export * from "./intake-data-values";

export * from "./recent-choice";

export * from "./validation-messages";

export * from "./intake-flow-authoring";

export * from "./runtime-resource";
export * from "./presentation-localization";
export * from "./entity-record-href";
export * from "./detail-navigation";
export * from "./validation/entity-code";
export * from "./validation/record-id";
export * from "./text/humanize";
export * from "./validation/values";
export * from "./routes/entity-read-route";

export type * from "./activity";

function bool(value: unknown): boolean {
  if (typeof value !== "boolean")
    throw new TypeError("Invalid Activity declaration");
  return value;
}

export * from "./activity-collections";

export * from "./activity-date-range";

export * from "./entity-relationship";

/** Descriptor and projected record from one authorized server read. */
/** The visible ancestors of a hierarchical record, root first (Entity list
 * Tree blueprint section 5.7). `parentOutsideView` says the first item's
 * parent, or the record's own when there are no items, is a record the viewer
 * cannot read; that record is never named. Labels are readable identities. */
export interface EntityAncestorPathV1 {
  readonly items: readonly { readonly id: string; readonly label: string; readonly href?: string }[];
  readonly parentOutsideView?: true;
}
export interface EntityDetailReadV1 {
  readonly descriptor: EntityDetailDescriptorV1;
  readonly record: EntityRecordV1;
  readonly ancestorPath?: EntityAncestorPathV1;
}
function parseAncestorPath(value: unknown): EntityAncestorPathV1 {
  const path = object(value, "ancestor path");
  if (!Array.isArray(path.items) || path.items.length > 16) fail("ancestor path items");
  const items = (path.items as unknown[]).map((raw) => {
    const item = object(raw, "ancestor");
    if (typeof item.id !== "string" || !item.id || typeof item.label !== "string") fail("ancestor identity");
    if (item.href !== undefined && (typeof item.href !== "string" || !/^\/(?!\/)/.test(item.href))) fail("ancestor href");
    return Object.freeze({ id: item.id, label: item.label, ...(typeof item.href === "string" ? { href: item.href } : {}) });
  });
  if (path.parentOutsideView !== undefined && path.parentOutsideView !== true) fail("ancestor path marker");
  return Object.freeze({ items: Object.freeze(items), ...(path.parentOutsideView === true ? { parentOutsideView: true as const } : {}) });
}
export function parseEntityDetailRead(value: unknown): EntityDetailReadV1 {
  const root = object(value, "detail read");
  const descriptor = parseEntityDetailDescriptor(root.descriptor);
  const record = parseEntityRecord(root.record);
  const allowed = new Set(descriptor.fields.map((field) => field.key));
  if (Object.keys(record.values).some((key) => !allowed.has(key)))
    fail("detail read field projection");
  return Object.freeze({
    descriptor,
    record,
    ...(root.ancestorPath === undefined ? {} : { ancestorPath: parseAncestorPath(root.ancestorPath) }),
  });
}

export { entityTransferWorkspaces } from "./transfer-workspace";

export * from "./reference-lookup";
