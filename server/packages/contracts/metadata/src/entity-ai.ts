/** Published AI configuration is capability metadata, never an authorization grant. */
export interface EntityAiCapabilityRefV1 {
  readonly id: string;
  readonly version: 1;
}
export type EntityAiContextKind = "manage" | "record";
export interface EntityAiDescriptorV1 {
  readonly schemaVersion: 1;
  readonly enabled: boolean;
  readonly aliases: readonly string[];
  readonly description?: string;
  /** Display order is semantic and is preserved. */
  readonly summaryFieldKeys: readonly string[];
  readonly searchFieldKeys: readonly string[];
  /** Reference-field keys and/or the published collectionRelationship.sourceRef. */
  readonly relationshipKeys: readonly string[];
  readonly contextKinds: readonly EntityAiContextKind[];
  readonly insightProviders: readonly EntityAiCapabilityRefV1[];
  readonly actions: readonly (EntityAiCapabilityRefV1 & { readonly operationKey: string })[];
  readonly presentationProfiles: readonly EntityAiCapabilityRefV1[];
}

export interface EntityAiReferenceContext {
  readonly entityCode: string;
  readonly planeKey?: string;
  readonly fields: readonly { readonly key: string; readonly searchable?: boolean; readonly reference?: boolean }[];
  readonly operationKeys: readonly string[];
  readonly collectionSourceRef?: string;
}

// Versioned publication vocabulary. Entries do not install/enable runtime tools.
// New owner capabilities must extend this catalogue together with conformance tests.
const providers = Object.freeze({
  bp_read_brief: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
  bp_explain_case_validation: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
  bp_explain_case_diff: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
  bp_explain_readiness: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
  bp_check_eligibility: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
  bp_read_summary: { entityCode: "business_partner", planeKey: "neon", contextKind: "record" },
} as const);
const profiles = Object.freeze({ record_brief: "record", list_brief: "manage", comparison: "manage" } as const);

export function parseEntityAiDescriptor(value: unknown, context: EntityAiReferenceContext): EntityAiDescriptorV1 {
  const item = object(value, "ai");
  exactKeys(item, ["schemaVersion", "enabled", "aliases", "description", "summaryFieldKeys", "searchFieldKeys", "relationshipKeys", "contextKinds", "insightProviders", "actions", "presentationProfiles"], "ai");
  if (item.schemaVersion !== 1) invalid("ai.schemaVersion", "unsupported version");
  if (typeof item.enabled !== "boolean") invalid("ai.enabled", "must be boolean");
  const aliases = strings(item.aliases, "ai.aliases", 20, false);
  const summaryFieldKeys = strings(item.summaryFieldKeys, "ai.summaryFieldKeys", 32);
  const searchFieldKeys = strings(item.searchFieldKeys, "ai.searchFieldKeys", 32);
  const relationshipKeys = strings(item.relationshipKeys, "ai.relationshipKeys", 16);
  const contextKinds = strings(item.contextKinds, "ai.contextKinds", 2).map(kind => {
    if (kind !== "manage" && kind !== "record") invalid("ai.contextKinds", "unknown context");
    return kind as EntityAiContextKind;
  });
  if (item.enabled && !contextKinds.length) invalid("ai.contextKinds", "enabled AI requires a context");
  const fields = new Map(context.fields.map(field => [field.key, field]));
  for (const key of summaryFieldKeys) if (!fields.has(key)) invalid("ai.summaryFieldKeys", `unknown field ${key}`);
  for (const key of searchFieldKeys) if (fields.get(key)?.searchable !== true) invalid("ai.searchFieldKeys", `field is not searchable: ${key}`);
  for (const key of relationshipKeys) if (fields.get(key)?.reference !== true && key !== context.collectionSourceRef) invalid("ai.relationshipKeys", `unknown published relationship ${key}`);
  const insightProviders = refs(item.insightProviders, "ai.insightProviders").map(ref => {
    if (!Object.hasOwn(providers, ref.id)) invalid("ai.insightProviders", `unregistered provider ${ref.id}`);
    const provider = providers[ref.id as keyof typeof providers];
    if (provider.entityCode !== context.entityCode || (context.planeKey !== undefined && provider.planeKey !== context.planeKey)) invalid("ai.insightProviders", "provider coordinate mismatch");
    if (!context.operationKeys.includes("read")) invalid("ai.insightProviders", "provider requires published read operation");
    if (!contextKinds.includes(provider.contextKind)) invalid("ai.insightProviders", "provider requires record context");
    return ref;
  });
  const actions = array(item.actions, "ai.actions", 16).map(raw => {
    const action = object(raw, "ai.actions");
    exactKeys(action, ["id", "version", "operationKey"], "ai.actions");
    const ref = reference(action, "ai.actions");
    // Only navigation is in the initial catalogue. Case submission remains the
    // separate existing governed tool, never inferred from an entity operation.
    if (ref.id !== "open_record") invalid("ai.actions", `unregistered action ${ref.id}`);
    const operationKey = code(action.operationKey, "ai.actions.operationKey");
    if (operationKey !== "read" || !context.operationKeys.includes(operationKey)) invalid("ai.actions.operationKey", "open_record requires published read operation");
    if (!contextKinds.length) invalid("ai.actions", "action requires context");
    return Object.freeze({ ...ref, operationKey });
  });
  unique(actions.map(action => action.id), "ai.actions");
  const presentationProfiles = refs(item.presentationProfiles, "ai.presentationProfiles").map(ref => {
    if (!Object.hasOwn(profiles, ref.id)) invalid("ai.presentationProfiles", `unregistered profile ${ref.id}`);
    if (!contextKinds.includes(profiles[ref.id as keyof typeof profiles])) invalid("ai.presentationProfiles", "profile context is not enabled");
    return ref;
  });
  return Object.freeze({ schemaVersion: 1, enabled: item.enabled, aliases: Object.freeze(aliases),
    ...(item.description === undefined ? {} : { description: text(item.description, "ai.description", 1024) }),
    summaryFieldKeys: Object.freeze(summaryFieldKeys), searchFieldKeys: Object.freeze(searchFieldKeys),
    relationshipKeys: Object.freeze(relationshipKeys), contextKinds: Object.freeze(contextKinds),
    insightProviders: Object.freeze(insightProviders), actions: Object.freeze(actions), presentationProfiles: Object.freeze(presentationProfiles) });
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path, "must be an object");
  return value as Record<string, unknown>;
}
function exactKeys(item: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(item)) if (!allowed.includes(key)) invalid(path, `unknown property ${key}`);
}
function array(value: unknown, path: string, limit: number): unknown[] {
  if (!Array.isArray(value) || value.length > limit) invalid(path, `must be an array of at most ${limit} items`);
  return value;
}
function text(value: unknown, path: string, limit: number): string {
  if (typeof value !== "string" || !value.trim() || value !== value.trim() || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) invalid(path, "invalid bounded text");
  return value;
}
function code(value: unknown, path: string): string {
  const result = text(value, path, 128);
  if (!/^[a-z][a-zA-Z0-9_.-]*$/.test(result)) invalid(path, "invalid reference key");
  return result;
}
function unique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) invalid(path, "duplicate references");
}
function strings(value: unknown, path: string, limit: number, identifiers = true): string[] {
  const values = array(value, path, limit).map(item => identifiers ? code(item, path) : text(item, path, 120));
  unique(identifiers ? values : values.map(item => item.toLocaleLowerCase("en-US")), path);
  return values;
}
function reference(item: Record<string, unknown>, path: string): EntityAiCapabilityRefV1 {
  if (item.version !== 1) invalid(path, "unsupported capability version");
  return Object.freeze({ id: code(item.id, path), version: 1 });
}
function refs(value: unknown, path: string): EntityAiCapabilityRefV1[] {
  const result = array(value, path, 16).map(raw => {
    const item = object(raw, path);
    exactKeys(item, ["id", "version"], path);
    return reference(item, path);
  });
  unique(result.map(item => item.id), path);
  return result;
}
function invalid(path: string, message: string): never { throw new TypeError(`${path}: ${message}`); }
