/**
 * WriteDescriptor — runtime write-authorization metadata for an entity.
 *
 * Compiles `control.entity_field` into a fast in-memory shape that facades and
 * PATCH handlers can consult to answer three questions without hand-maintaining
 * a static list per entity:
 *
 *   1. Is this field one the caller is allowed to supply on CREATE?
 *      (rejects is_read_only / is_computed / is_write_once / origin='system')
 *   2. Is this field REQUIRED on CREATE?
 *      (is_required=true AND editable in the initial-status snapshot)
 *   3. Is this field editable in the record's CURRENT status?
 *      (editability.editable_in_status contains current status)
 *
 * The descriptor is cached process-lifetime, keyed by entity_code. Lookup
 * values (control.lookup_value) rarely change; entity_field seeds are
 * platform-canonical and only change on deploy. Later phases can wire a
 * SIGHUP or a versioned cache key. For now, restart to invalidate.
 *
 * Not intended to replace `EntityCompilerService` — that snapshots the whole
 * entity for compliance / frontend descriptors. This module is a narrow
 * write-side projection tuned for hot request paths.
 */

import { sql, type Kysely } from "kysely";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<Record<string, any>>;

/** Structured issue returned by the assert* helpers. */
export interface WriteDescriptorViolation {
  code:      string;
  message:   string;
  field?:    string;
  fields?:   string[];
}

export interface WriteDescriptor {
  entityCode:       string;
  entityVersionId:  string;
  /** Every field name registered against the entity_version, mapped to spec. */
  fieldsByName:     Map<string, FieldSpec>;
  /** Field names the client MAY supply on create. */
  writable:         Set<string>;
  /**
   * Field names the system manages — supplying them on create/update yields
   * SYSTEM_FIELD_NOT_WRITABLE. Union of read-only, computed, and origin=system.
   * (write-once is separately handled: writable on create, systemManaged
   *  thereafter — see systemManagedOnUpdate.)
   */
  systemManaged:    Set<string>;
  /** systemManaged ∪ write_once. Used by the update path. */
  systemManagedOnUpdate: Set<string>;
  /** Fields required to create; caller must supply non-null values. */
  required:         Set<string>;
  /**
   * status → set of field names editable in that status.
   * Derived from editability.editable_in_status; empty array means "never".
   * A field NOT keyed under any status is treated as "always editable"
   * (backward-compatible with entity fields that predate the editability jsonb).
   */
  editableInStatus: Map<string, Set<string>>;
  /** Fields with NO editability jsonb — treated as always editable. */
  alwaysEditable:   Set<string>;
}

interface FieldSpec {
  name:           string;
  columnName:     string;
  dataType:       string;
  origin:         string;
  isRequired:     boolean;
  isReadOnly:     boolean;
  isComputed:     boolean;
  isWriteOnce:    boolean;
  editability:    Record<string, unknown> | null;
}

interface EntityFieldRow {
  name:           string;
  column_name:    string;
  data_type:      string;
  origin:         string;
  is_required:    boolean;
  is_read_only:   boolean;
  is_computed:    boolean;
  is_write_once:  boolean;
  editability:    string | Record<string, unknown> | null;
  entity_version_id: string;
}

const CACHE = new Map<string, WriteDescriptor>();

/** Empty descriptor returned when the entity does not exist. Not cached. */
const EMPTY_DESCRIPTOR: Omit<WriteDescriptor, "entityCode"> = {
  entityVersionId:       "",
  fieldsByName:          new Map(),
  writable:              new Set(),
  systemManaged:         new Set(),
  systemManagedOnUpdate: new Set(),
  required:              new Set(),
  editableInStatus:      new Map(),
  alwaysEditable:        new Set(),
};

/**
 * Load (or return cached) descriptor for `entityCode`.
 * Uses the platform-scoped entity (tenant_id IS NULL) at version_no=1.
 * Returns a descriptor with empty sets if the entity is not registered.
 */
export async function getWriteDescriptor(
  db:         AnyDb,
  entityCode: string,
): Promise<WriteDescriptor> {
  const compiled = await loadCompiledWriteDescriptor(db, entityCode);
  if (compiled) {
    const cached = CACHE.get(compiled.cacheKey);
    if (cached) return cached;
    CACHE.set(compiled.cacheKey, compiled.descriptor);
    return compiled.descriptor;
  }
  // Fail closed: runtime writes never reconstruct behavior from projection
  // tables or compatibility columns when the published artifact is absent.
  return { entityCode, ...EMPTY_DESCRIPTOR };
}

async function loadCompiledWriteDescriptor(
  db: AnyDb,
  entityCode: string,
): Promise<{ cacheKey: string; descriptor: WriteDescriptor } | null> {
  const result = await sql<{
    compiled_json: unknown;
    compiled_hash: string;
    entity_version_id: string;
  }>`
    SELECT ec.compiled_json, ec.compiled_hash, ev.id AS entity_version_id
      FROM control.entity_publish_state state
      JOIN control.entity e ON e.id=state.entity_id
      JOIN control.entity_version ev ON ev.id=state.published_version_id
      JOIN snapshot.entity_plane_compiled ec
        ON ec.entity_version_id=state.published_version_id
       AND ec.plane_key='neon'
       AND ec.tenant_id IS NOT DISTINCT FROM state.tenant_id
     WHERE (e.entity_code = ${entityCode}::text OR e.name = ${entityCode}::text OR e.slug = ${entityCode}::text)
       AND e.tenant_id IS NULL
       AND ev.status = 'EFFECTIVE'
       AND state.readiness_status='READY'
       AND state.contract_hash=ec.contract_hash
       AND state.materialized_hash=ec.materialized_hash
       AND state.neon_compiled_hash=ec.compiled_hash
     LIMIT 1
  `.execute(db);
  const row = result.rows[0];
  if (!row) return null;
  let json = row.compiled_json;
  if (typeof json === "string") {
    try { json = JSON.parse(json) as unknown; } catch { return null; }
  }
  const root = normalizeJson(json);
  const capability = normalizeJson(root?.["capability_manifest"]);
  const write = normalizeJson(capability?.["write"]);
  if (write?.["entityVersionId"] !== row.entity_version_id || !Array.isArray(write["fields"])) return null;

  const fieldsByName = new Map<string, FieldSpec>();
  const writable = new Set<string>();
  const systemManaged = new Set<string>();
  const systemManagedOnUpdate = new Set<string>();
  const required = new Set<string>();
  const editableInStatus = new Map<string, Set<string>>();
  const alwaysEditable = new Set<string>();

  for (const raw of write["fields"]) {
    const field = normalizeJson(raw);
    if (!field) return null;
    const writableDecision = normalizeJson(field?.["writable"]);
    const requiredDecision = normalizeJson(field?.["required"]);
    const name = typeof field?.["name"] === "string" ? field["name"] : null;
    const columnName = typeof field?.["columnName"] === "string" ? field["columnName"] : null;
    const dataType = typeof field?.["dataType"] === "string" ? field["dataType"] : null;
    if (!name || !columnName || !dataType) return null;
    const statuses = Array.isArray(field["editableInStatuses"])
      ? field["editableInStatuses"].filter((value): value is string => typeof value === "string")
      : [];
    const statusLimited = field["statusLimited"] === true;
    const isReadOnly = field["readOnly"] === true;
    const isComputed = field["computed"] === true;
    const isWriteOnce = field["writeOnce"] === true;
    const isSystemManaged = field["systemManaged"] === true;
    const origin = typeof field["origin"] === "string" ? field["origin"] : "user";
    fieldsByName.set(name, {
      name,
      columnName,
      dataType,
      origin,
      isRequired: requiredDecision?.["create"] === true,
      isReadOnly,
      isComputed,
      isWriteOnce,
      editability: statusLimited ? { editable_in_status: statuses } : null,
    });
    if (writableDecision?.["create"] === true) writable.add(name);
    if (isSystemManaged) systemManaged.add(name);
    if (isSystemManaged || isWriteOnce) systemManagedOnUpdate.add(name);
    if (requiredDecision?.["create"] === true) required.add(name);
    if (!statusLimited) {
      alwaysEditable.add(name);
    } else {
      for (const status of statuses) {
        const bucket = editableInStatus.get(status) ?? new Set<string>();
        bucket.add(name);
        editableInStatus.set(status, bucket);
      }
    }
  }

  return {
    cacheKey: `${entityCode}:${row.compiled_hash}`,
    descriptor: {
      entityCode,
      entityVersionId: row.entity_version_id,
      fieldsByName,
      writable,
      systemManaged,
      systemManagedOnUpdate,
      required,
      editableInStatus,
      alwaysEditable,
    },
  };
}

/**
 * TEST-ONLY: clears the process-lifetime cache. Not exported through the
 * package barrel; imports must reach directly here.
 */
export function __resetWriteDescriptorCache(): void {
  CACHE.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// Assertion helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reject caller-supplied values for system-managed fields.
 * `mode='create'` uses `systemManaged`; `mode='update'` uses the write-once-
 * extended set so write-once fields are also blocked after create.
 */
export function assertNoSystemFields(
  descriptor: WriteDescriptor,
  input:      Record<string, unknown>,
  mode:       "create" | "update",
): WriteDescriptorViolation | null {
  const blocked = mode === "create"
    ? descriptor.systemManaged
    : descriptor.systemManagedOnUpdate;
  const offenders: string[] = [];
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) continue;
    if (blocked.has(key)) offenders.push(key);
  }
  if (offenders.length === 0) return null;
  return {
    code:    "SYSTEM_FIELD_NOT_WRITABLE",
    fields:  offenders,
    message: `Fields ${offenders.map((f) => `'${f}'`).join(", ")} are system-managed and cannot be supplied.`,
  };
}

/**
 * Assert every required field is present with a non-null, non-empty-string value.
 */
export function assertRequiredFieldsPresent(
  descriptor: WriteDescriptor,
  input:      Record<string, unknown>,
): WriteDescriptorViolation | null {
  const missing: string[] = [];
  for (const name of descriptor.required) {
    const value = input[name];
    if (value === undefined || value === null) { missing.push(name); continue; }
    if (typeof value === "string" && value.trim() === "") { missing.push(name); continue; }
  }
  if (missing.length === 0) return null;
  return {
    code:    "REQUIRED_FIELDS_MISSING",
    fields:  missing,
    message: `Missing required field${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.`,
  };
}

/**
 * Assert every changed field in `input` is editable in the record's
 * `currentStatus`. Fields marked always-editable pass regardless. Fields
 * system-managed on update also fail — but that's a separate concern; call
 * `assertNoSystemFields(..., 'update')` alongside for the full guard.
 */
export function assertEditableInStatus(
  descriptor:     WriteDescriptor,
  currentStatus:  string,
  changedInput:   Record<string, unknown>,
): WriteDescriptorViolation | null {
  const editableNow = descriptor.editableInStatus.get(currentStatus) ?? new Set<string>();
  const locked: string[] = [];
  for (const key of Object.keys(changedInput)) {
    if (changedInput[key] === undefined) continue;
    // Field not registered on the entity — records route deals with that
    // separately (unknown field rejection). Skip here.
    if (!descriptor.fieldsByName.has(key)) continue;
    // Always-editable, or editable in the current status — allow.
    if (descriptor.alwaysEditable.has(key)) continue;
    if (editableNow.has(key)) continue;
    locked.push(key);
  }
  if (locked.length === 0) return null;
  return {
    code:    "FIELD_NOT_EDITABLE_IN_STATUS",
    fields:  locked,
    message: `Field${locked.length > 1 ? "s" : ""} ${locked.map((f) => `'${f}'`).join(", ")} not editable while status='${currentStatus}'.`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function normalizeJson(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try { return JSON.parse(value) as Record<string, unknown>; }
    catch { return null; }
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * Extract `editability.editable_in_status` as a string array.
 * Returns `null` when the field carries no editability spec — signalling
 * "always editable" per the descriptor semantics.
 * Returns `[]` when the spec exists but the array is empty — signalling
 * "locked in every status".
 */
function extractEditableStatuses(
  editability: Record<string, unknown> | null,
): string[] | null {
  if (!editability) return null;
  const raw = editability["editable_in_status"];
  if (raw === undefined) return null;
  if (Array.isArray(raw)) {
    return raw.filter((v): v is string => typeof v === "string");
  }
  return [];
}
