import { isCanonicalEntityCode } from "./validation/entity-code";
import { isEntityRecordId } from "./validation/record-id";
import type { EntityDetailDescriptorV1 } from "./index";
import { parseEntityRuntimeLocalizedText, type EntityRuntimeLocalizedTextV1 } from "./runtime-resource";

/** Related-section text: plain text, or published localized text (label key, default and
 * translations hydrated from the entity's localization sidecar). */
export type EntityRelatedTextV1 = string | EntityRuntimeLocalizedTextV1;

export interface EntityRelationshipScopeV1 {
  readonly parentEntityCode: string;
  readonly parentRecordId: string;
  readonly relationshipKey: string;
  readonly parentDescriptorHash: string;
}

/** Select only a relationship registered in the authorized parent presentation.
 * The server independently resolves its predicates and checks current access. */
export function bindEntityRelationship(
  descriptor: Pick<EntityDetailDescriptorV1, "entity" | "revision" | "presentation">,
  recordId: string,
  relationshipKey: string,
): Readonly<{ relationship: EntityRelationshipV1; scope: EntityRelationshipScopeV1 }> {
  if (!isCanonicalEntityCode(descriptor.entity.code) ||
      !isEntityRecordId(recordId) ||
      !/^[a-f0-9]{64}$/.test(descriptor.revision.descriptorHash))
    throw new TypeError("Invalid parent relationship coordinate");
  const relationships = parseEntityRelationships(descriptor.presentation?.entityRelationships ?? []);
  const relationship = relationships.find(item => item.key === relationshipKey);
  if (!relationship) throw new TypeError("Unregistered entity relationship");
  return Object.freeze({ relationship, scope: Object.freeze({
    parentEntityCode: descriptor.entity.code,
    parentRecordId: recordId,
    relationshipKey,
    parentDescriptorHash: descriptor.revision.descriptorHash,
  }) });
}

/** Published relationship identity and field mappings, never an executable query.
 * Tenant scope is mandatory and resolved independently of request filters. */
export interface EntityRelationshipV1 {
  readonly emptyState?: Readonly<{ /** Short heading; the message becomes its description. */ title?: EntityRelatedTextV1; message: EntityRelatedTextV1; setupLabel: EntityRelatedTextV1; editLabel: EntityRelatedTextV1; creation: "on_save" }>;
  readonly key: string;
  readonly targetEntity: string;
  readonly cardinality: "zero_or_one" | "many";
  readonly fields: readonly { readonly source: string; readonly target: string }[];
  readonly tenant: { readonly source: string; readonly target: string };
  readonly readOperation: string;
}

const name = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(value)) throw new TypeError("Invalid entity relationship reference");
  return value;
};
function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Invalid entity relationship object");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(row, key))) throw new TypeError("Invalid entity relationship properties");
  return row;
}
function mapping(value: unknown) {
  const row = object(value, ["source", "target"]);
  return Object.freeze({ source: name(row.source), target: name(row.target) });
}
export function parseEntityRelationships(value: unknown): readonly EntityRelationshipV1[] {
  if (!Array.isArray(value) || value.length > 32) throw new TypeError("Invalid entity relationships");
  const relationships = value.map(raw => {
    const candidate = raw as Record<string, unknown>;
    const row = object(raw, ["key", "targetEntity", "cardinality", "fields", "tenant", "readOperation", ...(candidate?.emptyState === undefined ? [] : ["emptyState"])]);
    let emptyState: EntityRelationshipV1["emptyState"];
    if (row.emptyState !== undefined) {
      if (row.cardinality !== "zero_or_one") throw TypeError("Empty setup requires a single-record relationship");
      const state = object(row.emptyState, ["message", "setupLabel", "editLabel", "creation", ...((row.emptyState as Record<string, unknown>)?.title === undefined ? [] : ["title"])]);
      if (state.creation !== "on_save") throw TypeError("Related setup must create on save");
      const label = (value: unknown, max: number): EntityRelatedTextV1 => {
        if (typeof value === "string") { if (!value.trim() || value.length > max) throw TypeError("Invalid related setup text"); return value; }
        const localized = parseEntityRuntimeLocalizedText(value);
        if (localized.defaultText.length > max || Object.values(localized.values ?? {}).some((text) => text.length > max)) throw TypeError("Invalid related setup text");
        return localized;
      };
      emptyState = Object.freeze({...(state.title === undefined ? {} : { title: label(state.title, 120) }),message:label(state.message,500),setupLabel:label(state.setupLabel,80),editLabel:label(state.editLabel,80),creation:"on_save"});
    }
    if (row.readOperation !== "list" || !isCanonicalEntityCode(row.targetEntity) || !["zero_or_one", "many"].includes(String(row.cardinality)) ||
        !Array.isArray(row.fields) || !row.fields.length || row.fields.length > 8) throw new TypeError("Invalid entity relationship binding");
    const fields = row.fields.map(mapping), tenant = mapping(row.tenant);
    if (new Set(fields.map(field => field.source)).size !== fields.length || new Set(fields.map(field => field.target)).size !== fields.length ||
        fields.some(field => field.source === tenant.source || field.target === tenant.target)) throw new TypeError("Duplicate entity relationship mapping");
    return Object.freeze({ ...(emptyState ? { emptyState } : {}), key: name(row.key), targetEntity: row.targetEntity as string,
      cardinality: row.cardinality as EntityRelationshipV1["cardinality"], fields: Object.freeze(fields), tenant, readOperation: name(row.readOperation) });
  });
  if (new Set(relationships.map(row => row.key)).size !== relationships.length) throw new TypeError("Duplicate entity relationship key");
  return Object.freeze(relationships);
}

export interface EntityRelationshipContract {
  readonly entityCode: string;
  readonly plane: string;
  readonly tenantField: string;
  readonly fields: Readonly<Record<string, string>>;
  readonly operations: readonly string[];
  /** Each set is a qualified storage unique key, including tenant when applicable. */
  readonly uniqueKeys: readonly (readonly string[])[];
}

/** Used against exact candidate/active contracts during publication qualification.
 * Caller supplies approved dependencies; this function grants no runtime access. */
export function qualifyEntityRelationship(owner: EntityRelationshipContract, target: EntityRelationshipContract, relation: EntityRelationshipV1): void {
  if (target.entityCode !== relation.targetEntity || target.plane !== owner.plane ||
      owner.tenantField !== relation.tenant.source || target.tenantField !== relation.tenant.target ||
      !target.operations.includes(relation.readOperation) || (relation.cardinality === "zero_or_one" && !target.operations.includes("read"))) throw new TypeError("Entity relationship dependency mismatch");
  for (const field of [relation.tenant, ...relation.fields]) {
    if (!owner.fields[field.source] || owner.fields[field.source] !== target.fields[field.target]) throw new TypeError("Entity relationship field mismatch");
  }
  if (relation.cardinality === "zero_or_one") {
    const mapped = new Set([relation.tenant.target, ...relation.fields.map(field => field.target)]);
    if (!target.uniqueKeys.some(key => key.length > 0 && key.every(field => mapped.has(field)))) throw new TypeError("Entity relationship target is not unique");
  }
}
