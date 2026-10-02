import { isCanonicalEntityCode } from "./validation/entity-code";

/** Published relationship identity and field mappings, never an executable query.
 * Tenant scope is mandatory and resolved independently of request filters. */
export interface EntityRelationshipV1 {
  readonly emptyState?: Readonly<{ message: string; setupLabel: string; editLabel: string; creation: "on_save" }>;
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
      const state = object(row.emptyState, ["message", "setupLabel", "editLabel", "creation"]);
      if (state.creation !== "on_save") throw TypeError("Related setup must create on save");
      const label = (value: unknown, max: number): string => { if(typeof value !== "string" || !value.trim() || value.length > max) throw TypeError("Invalid related setup text"); return value; };
      emptyState = Object.freeze({message:label(state.message,500),setupLabel:label(state.setupLabel,80),editLabel:label(state.editLabel,80),creation:"on_save"});
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
