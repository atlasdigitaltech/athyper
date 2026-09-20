import type { PlaneKey } from "@athyper/server-foundation/context";
import type { PinnedCompiledEntityReader } from "./compiled-entity-reader.js";

type Coordinate = Readonly<{
  tenantId: string;
  principalId: string;
  planeKey: PlaneKey;
  entityCode: string;
  /** Entity owning the flow artifact; defaults to the release coordinate entity. */
  flowEntityCode?: string;
}>;
type RecordValue = Readonly<Record<string, unknown>>;

/**
 * Generic, pinned Flow reader. Domains select a flow key and journey in
 * composition; this reader never derives either from an entity-specific kind.
 */
export class CompiledEntityFlowReader {
  constructor(private readonly reader: PinnedCompiledEntityReader) {}

  async read(input: Coordinate & { readonly flowKey: string }) {
    const release = await this.reader.resolve(input);
    if (!release) throw new Error("COMPILED_ENTITY_FLOW_RELEASE_UNAVAILABLE");
    const flowEntityCode = input.flowEntityCode ?? input.entityCode;
    return Object.freeze({ release, flow: await this.reader.artifactByKey(release, `${flowEntityCode}/flow.${input.flowKey}`, "flow") });
  }

  async readBase(input: Coordinate & { readonly flowKey: string }) {
    const value = await this.read(input);
    const flowEntityCode = input.flowEntityCode ?? input.entityCode;
    return Object.freeze({ ...value, base: await this.reader.artifactByKey(value.release, `${flowEntityCode}/flow.base`, "flow") });
  }

  async requestSchema(input: Coordinate & { readonly flowKey: string; readonly sourceKind: string }) {
    const { release, flow } = await this.read(input);
    if (!record(flow.content.requestContract) || !Array.isArray(flow.content.supportedSources))
      throw new Error("COMPILED_ENTITY_FLOW_REQUEST_SCHEMA_MISSING");
    const source = input.sourceKind === "manual" ? "internal" : input.sourceKind;
    if (!flow.content.supportedSources.includes(source))
      throw new Error("COMPILED_ENTITY_FLOW_SOURCE_MAPPING_MISSING");
    return Object.freeze({
      code: `${input.planeKey}.${flow.entityCode}.${input.flowKey}`,
      version: release.release.releaseNo,
      hash: flow.artifactHash,
      releaseId: release.release.releaseId,
    });
  }

  async workflow(input: Coordinate & {
    readonly flowKey: string;
    readonly journey: string;
    readonly proposedPayload?: RecordValue;
  }) {
    const { release, base } = await this.readBase(input);
    const definitions = record(base.content.workflowDefinitions) ? base.content.workflowDefinitions : {};
    const definition = record(definitions[input.journey]) ? definitions[input.journey] as Record<string, unknown> : undefined;
    if (!definition || !Array.isArray(definition.stages))
      throw new Error("COMPILED_ENTITY_FLOW_WORKFLOW_MISSING");
    const stages = definition.stages.filter(record).map((stage, index) =>
      workflowStage({ ...stage, name: localizedText(stage.label) ?? stage.code }, input.proposedPayload ?? {}, index),
    );
    const first = stages.find((stage) => stage.routed);
    if (!first) throw new Error("COMPILED_ENTITY_FLOW_WORKFLOW_ROUTE_EMPTY");
    return Object.freeze({
      code: `${input.planeKey}.${input.entityCode}.${input.journey}.onboarding`,
      version: release.release.releaseNo,
      hash: base.artifactHash,
      stageCode: first.code,
      stageName: first.name,
      stages: Object.freeze(stages),
      definition,
    });
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function localizedText(value: unknown): string | undefined {
  return record(value) && typeof value.defaultText === "string" ? value.defaultText : undefined;
}
function workflowStage(stage: Record<string, unknown>, payload: RecordValue, index: number) {
  const code = String(stage.code ?? `stage_${index + 1}`);
  const condition = record(stage.when) ? stage.when : undefined;
  const routed = condition ? matches(payload, condition) : true;
  const rawQuorum = stage.quorum;
  const quorum = record(rawQuorum)
    ? { kind: String(rawQuorum.kind ?? "any") as "all" | "any" | "count" | "percentage", ...(Number.isFinite(Number(rawQuorum.value)) ? { value: Number(rawQuorum.value) } : {}) }
    : typeof rawQuorum === "number" ? { kind: "count" as const, value: rawQuorum }
    : { kind: stage.mode === "all" ? "all" as const : "any" as const };
  return Object.freeze({
    code,
    name: String(stage.name ?? code.replaceAll("_", " ")),
    mode: stage.mode === "serial" ? "serial" as const : "parallel" as const,
    quorum,
    routed,
    ...(condition ? { routeEvidence: { condition, matched: routed } } : {}),
    ...(positive(stage.slaMinutes) ? { slaMinutes: Number(stage.slaMinutes) } : {}),
    remindersAtMinutes: Array.isArray(stage.remindersAtMinutes) ? stage.remindersAtMinutes.map(Number).filter(positive) : [],
    ...(positive(stage.escalateAtMinutes) ? { escalateAtMinutes: Number(stage.escalateAtMinutes) } : {}),
  });
}
function matches(payload: RecordValue, condition: Record<string, unknown>) {
  const actual = path(payload, String(condition.path ?? condition.field ?? ""));
  const operator = String(condition.operator ?? "equals"), expected = condition.value;
  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (operator === "in") return Array.isArray(expected) && expected.includes(actual);
  if (operator === "exists") return expected === false ? actual === undefined : actual !== undefined;
  return false;
}
function path(value: unknown, coordinate: string): unknown {
  return coordinate.split(".").filter(Boolean).reduce<unknown>((current, key) => record(current) ? current[key] : undefined, value);
}
function positive(value: unknown): boolean { return Number.isFinite(Number(value)) && Number(value) > 0; }

/**
 * Temporary V1 application-descriptor projection. It is deliberately generic:
 * the caller supplies the published flow and form artifact coordinates; no entity
 * code, request kind, or domain handler is embedded here. It lets V1 workspaces
 * consume a pinned release while they migrate to native compiled surfaces.
 */
export async function projectPinnedIntakeApplication(input: {
  readonly reader: PinnedCompiledEntityReader;
  readonly coordinate: Coordinate;
  readonly entity: { readonly code: string; readonly label: string; readonly pluralLabel: string };
  readonly intake: {
    readonly flowArtifactKey: string;
    readonly formArtifactKeys: readonly string[];
    readonly flow: { readonly key: string; readonly title: string; readonly entryOperation: string; readonly completionOperation: string };
  };
  readonly scope: { readonly status: "ready" | "context_required"; readonly fingerprint: string; readonly labels: readonly { readonly key: string; readonly label: string; readonly value: string }[] };
}): Promise<import("@athyper/contract-platform-entity-list").EntityApplicationDescriptorV1> {
  const release = await input.reader.resolve(input.coordinate);
  if (!release) throw new Error("COMPILED_ENTITY_APPLICATION_RELEASE_UNAVAILABLE");
  const selector = await input.reader.artifactByKey(release, input.intake.flowArtifactKey, "flow");
  const forms = await Promise.all(input.intake.formArtifactKeys.map(key => input.reader.artifactByKey(release, key, "presentation_section")));
  const roles = [...new Set((Array.isArray(selector.content.flowRefs) ? selector.content.flowRefs : [])
    .map(value => typeof value === "string" ? value.split("/").at(-1)?.split(".")[1] : undefined)
    .filter((value): value is string => value === "supplier" || value === "customer"))];
  const roleSurface = Object.freeze({
    schemaVersion: 1 as const, key: "intake_partner", title: "Partner", columns: 1 as const,
    sections: Object.freeze([{ key: "role", title: "Choose a role", fields: Object.freeze([{
      key: "requested_role", control: "choiceCards" as const, label: "Requested role", required: true,
      presentation: { layout: "grid" as const, optionColumns: 2 as const, density: "compact" as const },
      options: Object.freeze(roles.map(role => ({ value: role, label: role[0]!.toUpperCase() + role.slice(1) }))),
    }]) }]),
  });
  const projectedForms = forms.map(form => projectForm(form.content.form));
  const detailSections = projectedForms.flatMap(form => form.sections);
  const collectionSurfaces = projectedForms.flatMap(form => form.collectionSurfaces);
  // `EntityApplicationDescriptorV1` is a compatibility transport whose labels
  // are plain strings.  These are generic workspace controls, not domain
  // presentation: domain field and section labels above remain sourced from
  // the pinned artifacts.  Native compiled intake surfaces replace this
  // compatibility projection and carry localized label references directly.
  const detailSurface = Object.freeze({ schemaVersion: 1 as const, key: "intake_details", title: "Details", formLabels: legacyIntakeFormLabels(), columns: 2 as const, sections: Object.freeze(detailSections.length ? detailSections : [{ key: "details", fields: [{ key: "details", control: "input" as const, valueKey: "details", label: "Details", required: false, widget: "textarea" as const, columnSpan: 12 }] }]) });
  const reviewSurface = Object.freeze({ schemaVersion: 1 as const, key: "intake_review", title: "Review & submit", columns: 1 as const, sections: Object.freeze([{ key: "review", fields: Object.freeze([{ key: "review", control: "input" as const, valueKey: "review", label: "Review", required: false, widget: "textarea" as const, columnSpan: 12 }]) }]) });
  return Object.freeze({
    schemaVersion: 1, plane: input.coordinate.planeKey, entity: input.entity,
    revision: { release: release.release.releaseNo, descriptorHash: selector.artifactHash.replace("sha256:", ""), surfaceHash: forms[0]?.artifactHash.replace("sha256:", "") ?? selector.artifactHash.replace("sha256:", "") },
    surface: { key: "entity_application", title: input.entity.label }, actions: [], scope: input.scope,
    intakeFlows: Object.freeze([{ schemaVersion: 1 as const, key: input.intake.flow.key, kind: "create" as const, title: input.intake.flow.title, navigation: "linear" as const, allowDraftResume: true, entryOperation: input.intake.flow.entryOperation, completionOperation: input.intake.flow.completionOperation, steps: Object.freeze([{ key: "partner", surfaceKey: "intake_partner", title: "Partner", optional: false }, { key: "details", surfaceKey: "intake_details", title: "Details", optional: false }, { key: "review", surfaceKey: "intake_review", title: "Review & submit", optional: false }]) }]),
    intakeSurfaces: Object.freeze([roleSurface, detailSurface, reviewSurface, ...collectionSurfaces]),
  });
}
function projectForm(value: unknown): { readonly sections: readonly any[]; readonly collectionSurfaces: readonly any[] } {
  if (!record(value) || !Array.isArray(value.sections)) return { sections: [], collectionSurfaces: [] };
  const collectionSurfaces: any[] = [];
  const sections = value.sections.filter(record).map((section, index) => {
    const fields = Array.isArray(section.fields) ? section.fields.filter(record).map((field, fieldIndex) => ({
      key: safeIntakeKey(field.key, `field_${index}_${fieldIndex}`), control: "input" as const,
      valueKey: safeIntakeKey(field.key, `field_${index}_${fieldIndex}`), label: localizedText(field.label) ?? String(field.key ?? "Field"),
      required: field.required === true, widget: intakeWidget(field.widget), columnSpan: typeof field.columnSpan === "number" && field.columnSpan >= 1 && field.columnSpan <= 12 ? field.columnSpan : 12,
      ...(typeof field.maxLength === "number" ? { maxLength: field.maxLength } : {}),
      ...(localizedText(field.helpText) ? { helpText: localizedText(field.helpText) } : {}),
      ...(localizedText(field.placeholder) ? { placeholder: localizedText(field.placeholder) } : {}),
      ...(typeof field.defaultValue === "string" || typeof field.defaultValue === "number" || typeof field.defaultValue === "boolean" ? { defaultValue: field.defaultValue } : {}),
      ...(record(field.lookup) && Array.isArray(field.lookup.options) ? { lookup: { options: field.lookup.options.filter(record).flatMap(option => typeof option.value === "string" && localizedText(option.label) ? [{ value: option.value, label: localizedText(option.label)! }] : []) } } : {}),
      ...(typeof field.target === "string" && typeof field.path === "string" && ["context", "canonical", "request_only"].includes(field.target) ? { payload: { target: field.target as "context" | "canonical" | "request_only", path: field.path } } : {}),
    })) : [];
    const components = Array.isArray(section.components) ? section.components.filter(record) : [];
    const collections = components.flatMap((component, componentIndex) => {
      const projection = projectCollection(component, `${index}_${componentIndex}`);
      if (!projection) return [];
      collectionSurfaces.push(...projection.surfaces);
      return [projection.field];
    });
    // A component is a typed collection, not an unbound placeholder field.
    // This keeps the data surface and request serializer aligned: scalar fields
    // carry payload bindings; relationship values are produced by their typed
    // collection controls and handled by the registered domain extension.
    return { key: safeIntakeKey(section.key, `section_${index}`), ...(localizedText(section.title) ? { title: localizedText(section.title) } : {}), ...(localizedText(section.description) ? { description: localizedText(section.description) } : {}), fields: [...fields, ...collections] };
  });
  return { sections, collectionSurfaces };
}
function projectCollection(component: Record<string, unknown>, suffix: string): { readonly field: any; readonly surfaces: readonly any[] } | undefined {
  const kind = String(component.kind ?? "");
  const key = safeIntakeKey(component.key, `collection_${suffix}`);
  const title = localizedText(component.title) ?? (kind === "addresses" ? "Addresses" : kind === "contacts" ? "Contacts" : undefined);
  if (!title || !["addresses", "contacts"].includes(kind)) return undefined;
  const itemSurfaceKey = `intake_${key}_item`;
  const lookup = record(component.lookups) ? component.lookups : {};
  const options = (name: string) => Array.isArray(lookup[name]) ? lookup[name].filter(record).flatMap(option =>
    typeof option.value === "string" && localizedText(option.label) ? [{ value: option.value, label: localizedText(option.label)! }] : []) : [];
  const input = (key: string, label: string, widget: string = "text", extra: Record<string, unknown> = {}) => ({
    key, control: "input" as const, valueKey: key, label, required: false,
    widget: intakeWidget(widget), columnSpan: 6, ...extra,
  });
  const collection = {
    key: `details_${key}`, control: "repeatableGroup" as const, valueKey: key, label: title,
    itemLabel: kind === "addresses" ? "Address" : "Contact", itemSurfaceKey,
    minItems: positive(component.minItems) ? Number(component.minItems) : 0,
    maxItems: positive(component.maxItems) ? Number(component.maxItems) : 10,
    addLabel: typeof component.addLabel === "string" ? component.addLabel : `Add ${kind === "addresses" ? "address" : "contact"}`,
    removeLabel: `Remove ${kind === "addresses" ? "address" : "contact"}`,
    primaryField: "isPrimary", primaryLabel: kind === "addresses" ? "Primary address" : "Primary contact", columnSpan: 12,
    presentation: {
      renderer: kind, summary: kind === "addresses" ? [{ field: "purpose" }, { field: "line1" }, { field: "city" }] : [{ field: "contactName" }, { field: "businessTitle" }, { field: "channels", format: "count" }],
      emptyText: kind === "addresses" ? "Add an address and select its purpose." : "Add a contact and communication channel.", editLabel: "Edit", doneLabel: "Done", issuesLabel: "Issues: {count}",
    },
  };
  if (kind === "addresses") return {
    field: collection,
    surfaces: [{ schemaVersion: 1 as const, key: itemSurfaceKey, title: "Address", columns: 1 as const, sections: [{ key: "fields", fields: [
      input("purpose", "Purpose", "select", { required: true, lookup: { options: options("purposes") }, defaultValue: options("purposes")[0]?.value }),
      input("countryCode", "Country", "select", { required: true, lookup: { options: options("countries") }, normalize: "uppercase" }),
      input("line1", "Address line 1", "text", { required: true, maxLength: 255 }), input("line2", "Address line 2", "text", { maxLength: 255 }),
      input("city", "City", "text", { required: true, maxLength: 128 }), input("region", "Region", "text", { maxLength: 128 }), input("postalCode", "Postal code", "text", { maxLength: 32 }), input("isPrimary", "Primary address", "checkbox"),
    ] }] }],
  };
  const channelSurfaceKey = `${itemSurfaceKey}_channel`;
  return {
    field: collection,
    surfaces: [
      { schemaVersion: 1 as const, key: itemSurfaceKey, title: "Contact", columns: 1 as const, sections: [{ key: "fields", fields: [
        input("contactName", "Contact name", "text", { required: true, maxLength: 255 }), input("businessTitle", "Business title", "text", { maxLength: 255 }), input("departmentName", "Department", "text", { maxLength: 255 }), input("isPrimary", "Primary contact", "checkbox"),
        { key: "channels", control: "repeatableGroup" as const, valueKey: "channels", label: "Communication channels", itemLabel: "Channel", itemSurfaceKey: channelSurfaceKey, minItems: 1, maxItems: 10, addLabel: "Add channel", removeLabel: "Remove channel", primaryField: "isPrimary", primaryLabel: "Primary channel", columnSpan: 12, presentation: { renderer: "channels", summary: [{ field: "channelType" }, { field: "value" }, { field: "purpose" }], emptyText: "Add a way to reach this contact.", editLabel: "Edit", doneLabel: "Done", issuesLabel: "Issues: {count}" } },
      ] }] },
      { schemaVersion: 1 as const, key: channelSurfaceKey, title: "Communication channel", columns: 1 as const, sections: [{ key: "fields", fields: [
        input("channelType", "Channel type", "select", { required: true, lookup: { options: options("channels") }, defaultValue: options("channels")[0]?.value }), input("purpose", "Purpose", "select", { required: true, lookup: { options: options("purposes") }, defaultValue: options("purposes")[0]?.value }), input("value", "Contact detail", "text", { required: true, maxLength: 320 }), input("isPrimary", "Primary channel", "checkbox"),
      ] }] },
    ],
  };
}
function safeIntakeKey(value: unknown, fallback: string) { const key = typeof value === "string" ? value : fallback; return /^[a-z][a-z0-9_.-]{0,126}$/.test(key) ? key : fallback; }
function intakeWidget(value: unknown): "text" | "textarea" | "url" | "date" | "integer" | "decimal" | "checkbox" | "select" { return ["textarea", "url", "date", "integer", "decimal", "checkbox", "select"].includes(String(value)) ? String(value) as any : "text"; }
function legacyIntakeFormLabels() {
  return Object.freeze({
    continue: "Continue to review",
    submit: "Submit request",
    requestTitle: "Request",
    editTitle: "Edit request",
    editDescription: "Update the request details and save your changes.",
    close: "Close",
    draftStatus: "Draft",
    notSaved: "Not saved",
    unsavedChanges: "Unsaved changes",
    savedAt: "Saved",
    copyReference: "Copy reference",
    referenceCopied: "Reference copied",
    copyFailed: "Could not copy reference",
    changesNotSaved: "Changes were not saved",
    supplierRole: "Supplier",
    customerRole: "Customer",
    chooseRoleHint: "Choose the role for this request.",
    saveDraft: "Save draft",
    draftSaved: "Draft saved",
    savingDraft: "Saving draft",
    draftRetry: "The previous action may still be processing. Retry only when it is safe.",
    incompatibleDraft: "The saved draft was created with an incompatible published definition.",
  });
}
