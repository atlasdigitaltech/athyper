/**
 * Server-side source-change validation for record PATCH/PUT/POST.
 *
 * Loads `defaults.on_source_change` rules for the entity, invokes the pure
 * evaluator from @athyper/cascade with `layer="server_on_save"`, and
 * applies §6 of docs/specs/entity_field_defaults.md:
 *
 *   clear     — auto-clear iff target NOT in payload; 422 if stale value submitted
 *   rederive  — fill iff target unset; honor explicit submission as-is
 *   refilter  — re-validate target via dependent_filter (post-merge); 422 if stale
 *               and target was submitted; auto-clear if target left implicit
 *   validate  — always 422 on stale
 *   lock      — 422 if target submitted while source matches lock trigger
 *   warn      — ignored
 *
 * Spec: docs/specs/entity_field_defaults.md §6
 */

import { sql, type Kysely } from "kysely";
import {
  evaluateSourceChange,
  type EntityFieldDefaults,
  type SourceChangeIntent,
} from "@athyper/cascade";
import { runResolver, type ResolverContext } from "@athyper/svc-shared";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = Kysely<any>;

export type SourceChangeErrorCode =
  | "FIELD_DEPENDENCY_STALE"
  | "FIELD_DEPENDENCY_REFILTER_FAIL"
  | "FIELD_DEPENDENCY_INVALID"
  | "FIELD_LOCKED";

export interface SourceChangeError {
  code:    SourceChangeErrorCode;
  field:   string;
  sources: string[];
  reason:  string;
  message: string;
}

export interface ServerSourceChangeOutcome {
  /** Targets the server cleared because user did not submit them. */
  autoCleared: string[];
  /** Targets the server filled via resolver because user left them unset. */
  autoFilled:  Record<string, unknown>;
  /** Stale-value violations to surface as 422. */
  errors:      SourceChangeError[];
}

export interface ApplyServerSourceChangeArgs {
  entityCode:    string;
  currentRow:    Readonly<Record<string, unknown>>;
  incomingPatch: Readonly<Record<string, unknown>>;
  db:            AnyDb;
  tenantId:      string;
  userId:        string;
  /** Cached map: target field → defaults. If omitted, loaded from DB. */
  defaultsByField?: Readonly<Record<string, EntityFieldDefaults>>;
}

/**
 * Top-level entry. Returns an outcome the caller merges into the patch
 * payload (autoCleared → null, autoFilled → values, errors → 422 response).
 */
export async function applyServerSourceChangeActions(
  args: ApplyServerSourceChangeArgs,
): Promise<ServerSourceChangeOutcome> {
  const defaultsByField = args.defaultsByField
    ?? await loadEntityFieldDefaults(args.db, args.entityCode);

  if (Object.keys(defaultsByField).length === 0) {
    return { autoCleared: [], autoFilled: {}, errors: [] };
  }

  const changedFields = collectChangedFields(args.currentRow, args.incomingPatch);
  if (changedFields.length === 0) {
    return { autoCleared: [], autoFilled: {}, errors: [] };
  }

  const oldValues = { ...args.currentRow };
  const newValues = { ...args.currentRow, ...args.incomingPatch };
  const rowStatus = readStatus(args.currentRow);

  const intents = evaluateSourceChange({
    changedFields,
    oldValues,
    newValues,
    defaultsByField,
    layer:     "server_on_save",
    rowStatus,
  });

  const outcome: ServerSourceChangeOutcome = {
    autoCleared: [],
    autoFilled:  {},
    errors:      [],
  };

  if (intents.length === 0) return outcome;

  const ctx: ResolverContext = { db: args.db, tenantId: args.tenantId, userId: args.userId };

  for (const intent of intents) {
    const targetSubmitted = Object.prototype.hasOwnProperty.call(args.incomingPatch, intent.target);
    const targetValueInPatch = args.incomingPatch[intent.target];
    const targetValueOnRow   = args.currentRow[intent.target];

    switch (intent.action) {
      case "clear":
        if (targetSubmitted) {
          // Stale value submitted alongside source change → 422.
          if (!isBlank(targetValueInPatch)) {
            outcome.errors.push(staleError(intent, "FIELD_DEPENDENCY_STALE"));
          }
          // else: user submitted null/blank explicitly — accept as-is.
        } else if (!isBlank(targetValueOnRow)) {
          outcome.autoCleared.push(intent.target);
        }
        break;

      case "rederive": {
        if (targetSubmitted) {
          // Honor user submission — server has no provenance.
          break;
        }
        if ((intent.mode ?? "if_empty_or_derived") !== "always" && !isBlank(targetValueOnRow)) {
          // Existing value — server only fills when unset.
          break;
        }
        if (!intent.resolver) break;
        const result = await runResolver(intent.resolver, buildResolverInputs(intent, newValues, args.entityCode), ctx);
        if (result.ok && result.value !== null && result.value !== undefined) {
          outcome.autoFilled[intent.target] = result.value;
        }
        break;
      }

      case "refilter": {
        const valueToCheck = targetSubmitted ? targetValueInPatch : targetValueOnRow;
        if (isBlank(valueToCheck)) break;

        const passes = await targetPassesDependentFilter({
          db: args.db,
          tenantId: args.tenantId,
          entityCode: args.entityCode,
          targetField: intent.target,
          targetValue: valueToCheck,
          rowValuesPostMerge: newValues,
          defaults: defaultsByField[intent.target],
        });
        if (passes) break;

        if (targetSubmitted) {
          outcome.errors.push(staleError(intent, "FIELD_DEPENDENCY_REFILTER_FAIL"));
        } else {
          outcome.autoCleared.push(intent.target);
        }
        break;
      }

      case "validate":
        // Always 422 on stale.
        outcome.errors.push(staleError(intent, "FIELD_DEPENDENCY_INVALID"));
        break;

      case "lock":
        if (targetSubmitted) {
          outcome.errors.push(staleError(intent, "FIELD_LOCKED"));
        }
        break;

      case "warn":
        // Server ignores warn — they are client-only UX affordances.
        break;
    }
  }

  return outcome;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function staleError(intent: SourceChangeIntent, code: SourceChangeErrorCode): SourceChangeError {
  return {
    code,
    field:   intent.target,
    sources: intent.sources,
    reason:  intent.reason,
    message: intent.message ?? defaultStaleMessage(code, intent.target),
  };
}

function defaultStaleMessage(code: SourceChangeErrorCode, target: string): string {
  switch (code) {
    case "FIELD_DEPENDENCY_STALE":
      return `Field '${target}' is no longer valid because a source field changed. Submit a new value or omit it to auto-clear.`;
    case "FIELD_DEPENDENCY_REFILTER_FAIL":
      return `Field '${target}' references a row that no longer matches the dependent filter.`;
    case "FIELD_DEPENDENCY_INVALID":
      return `Field '${target}' failed dependency validation.`;
    case "FIELD_LOCKED":
      return `Field '${target}' is locked and cannot be modified in this state.`;
  }
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function readStatus(row: Readonly<Record<string, unknown>>): string | null {
  const status = row["status"];
  return typeof status === "string" ? status : null;
}

function collectChangedFields(
  current: Readonly<Record<string, unknown>>,
  patch:   Readonly<Record<string, unknown>>,
): string[] {
  const changed: string[] = [];
  for (const key of Object.keys(patch)) {
    const oldV = current[key];
    const newV = patch[key];
    if (oldV !== newV) changed.push(key);
  }
  return changed.sort();
}

function buildResolverInputs(
  intent: SourceChangeIntent,
  values: Record<string, unknown>,
  entityCode: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    entity:   entityCode,
    field:    intent.target,
    formData: { ...values },
  };
  for (const source of intent.sources) {
    out[source] = values[source];
  }
  return out;
}

/**
 * Loads `defaults` JSONB for every field of an entity (canonical version)
 * and returns the map keyed by logical field name.
 *
 * Caller may pre-load and pass `defaultsByField` to skip the query.
 */
export async function loadEntityFieldDefaults(
  db: AnyDb,
  entityCode: string,
): Promise<Record<string, EntityFieldDefaults>> {
  const rows = await sql<{ name: string; defaults: EntityFieldDefaults | null }>`
    SELECT ef.name, ef.defaults
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e          ON e.id  = ev.entity_id
     WHERE e.name       = ${entityCode}
       AND e.tenant_id  IS NULL
        AND e.runtime_enabled = true
        AND e.status    = 'ACTIVE'
        AND e.is_active = true
        AND ev.status    = 'EFFECTIVE'
        AND ef.is_active = true
        AND ef.runtime_enabled = true
        AND ef.defaults IS NOT NULL
  `.execute(db);

  const map: Record<string, EntityFieldDefaults> = {};
  for (const row of rows.rows) {
    if (row.defaults && typeof row.defaults === "object") {
      map[row.name] = row.defaults;
    }
  }
  return map;
}

/**
 * Re-validates a target value against its `lookup_config.dependent_filter`
 * after a source change. Returns true if the value still references a row
 * the picker would return for the new source values.
 *
 * V1 supports the common case: simple FK referencing a target table where
 * `dependent_filter.target_field` equals one of the source values.
 * More elaborate `through_entity` patterns return true (best-effort) —
 * we defer those to a Phase 8 hardening pass.
 */
async function targetPassesDependentFilter(args: {
  db: AnyDb;
  tenantId: string;
  entityCode: string;
  targetField: string;
  targetValue: unknown;
  rowValuesPostMerge: Readonly<Record<string, unknown>>;
  defaults: EntityFieldDefaults | undefined;
}): Promise<boolean> {
  // We need the target field's lookup_config + reference_config to know
  // which table to query and which column to validate against. Look it up
  // alongside the defaults.
  const ref = await loadFieldReferenceWiring(args.db, args.entityCode, args.targetField);
  if (!ref || !ref.dependentFilter) {
    // No dependent filter on this target — refilter is a no-op.
    return true;
  }

  const sourceField  = ref.dependentFilter.source_field;
  const targetColumn = ref.dependentFilter.target_field ?? ref.dependentFilter.source_field;
  if (!sourceField || !targetColumn) return true;

  const sourceValue = args.rowValuesPostMerge[sourceField];

  // ── Empty source handling (C3 / F4) ────────────────────────────────────────
  // Honor `dependent_filter.empty_behavior`:
  //   "none" (default) — when source is blank, picker shows nothing → any
  //                       non-blank target is stale and must clear.
  //   "all"            — when source is blank, picker shows all rows → target
  //                       is still valid (no constraint).
  if (isBlank(sourceValue)) {
    const behavior = ref.dependentFilter.empty_behavior ?? "none";
    return behavior === "all";
  }

  if (!ref.referenceEntity || !ref.referenceValueField) return true;

  // Resolve the target_entity's physical table.
  const tableRow = await sql<{ table_schema: string; table_name: string; tenant_column: string | null }>`
    SELECT table_schema, table_name, tenant_column
     FROM control.entity
     WHERE name = ${ref.referenceEntity}
       AND tenant_id IS NULL
       AND runtime_enabled = true
       AND status = 'ACTIVE'
       AND is_active = true
       AND read_capability <> 'none'
     LIMIT 1
  `.execute(args.db);
  const t = tableRow.rows[0];
  if (!t) return true;

  // SELECT 1 FROM <table> WHERE <value_field>=? AND <target_column>=? AND tenant_id=?
  // PLUS each static filter from lookup_config.filters (C2 / F3) so server
  // validation matches what the picker would actually return.
  const ident = (s: string) => sql.raw(`"${s.replace(/"/g, '""')}"`);
  const tbl = sql.raw(`"${t.table_schema}"."${t.table_name}"`);
  const tenantClause = t.tenant_column
    ? sql` AND ${ident(t.tenant_column)} = ${args.tenantId}::uuid`
    : sql``;

  const staticPreds = buildStaticFilterPredicates(ref.staticFilters);
  const staticClause = staticPreds.length > 0
    ? sql` AND ${sql.join(staticPreds, sql` AND `)}`
    : sql``;

  const result = await sql<{ ok: number }>`
    SELECT 1 AS ok
      FROM ${tbl}
     WHERE ${ident(ref.referenceValueField)} = ${args.targetValue}
       AND ${ident(targetColumn)}            = ${sourceValue}
       ${tenantClause}
       ${staticClause}
     LIMIT 1
  `.execute(args.db);

  return result.rows.length > 0;
}

/**
 * Builds SQL predicates for `lookup_config.filters` entries.
 *
 * Mirrors the picker's filter convention:
 *   - String values: comma-separated means IN (e.g. "bill_to,default")
 *   - Single string: equality
 *   - Number/bool: equality
 *   - Arrays: IN
 *
 * Unknown shapes are dropped (safer than producing wrong predicates).
 */
function buildStaticFilterPredicates(
  filters: Record<string, unknown> | null,
): import("kysely").RawBuilder<unknown>[] {
  if (!filters) return [];
  const ident = (s: string) => sql.raw(`"${s.replace(/"/g, '""')}"`);
  const out: import("kysely").RawBuilder<unknown>[] = [];

  for (const [key, raw] of Object.entries(filters)) {
    if (raw === null || raw === undefined) continue;
    // Skip names that don't look like SQL identifiers.
    if (!/^[a-z][a-z0-9_]*$/i.test(key)) continue;

    if (Array.isArray(raw)) {
      const vals = raw.filter((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean");
      if (vals.length === 0) continue;
      out.push(sql`${ident(key)} = ANY (${vals})`);
      continue;
    }
    if (typeof raw === "string") {
      const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) continue;
      if (parts.length === 1) {
        out.push(sql`${ident(key)} = ${parts[0]}`);
      } else {
        out.push(sql`${ident(key)} = ANY (${parts})`);
      }
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      out.push(sql`${ident(key)} = ${raw}`);
      continue;
    }
    // Skip object/json filter shapes — not safe to translate generically.
  }

  return out;
}

interface FieldReferenceWiring {
  dependentFilter:    {
    source_field?:   string;
    target_field?:   string;
    empty_behavior?: "none" | "all";
  } | null;
  /** Static filters from `lookup_config.filters`. */
  staticFilters:      Record<string, unknown> | null;
  referenceEntity:    string | null;
  referenceValueField: string | null;
}

async function loadFieldReferenceWiring(
  db: AnyDb,
  entityCode: string,
  fieldName: string,
): Promise<FieldReferenceWiring | null> {
  const rows = await sql<{
    lookup_config:    Record<string, unknown> | null;
    reference_config: Record<string, unknown> | null;
    validation:       Record<string, unknown> | null;
  }>`
    SELECT ef.lookup_config, ef.reference_config, ef.validation
      FROM control.entity_field ef
      JOIN control.entity_version ev ON ev.id = ef.entity_version_id
      JOIN control.entity e          ON e.id  = ev.entity_id
     WHERE e.name       = ${entityCode}
       AND e.tenant_id  IS NULL
       AND e.runtime_enabled = true
       AND e.status      = 'ACTIVE'
       AND e.is_active   = true
       AND ev.status    = 'EFFECTIVE'
       AND ef.is_active = true
       AND ef.runtime_enabled = true
       AND ef.name      = ${fieldName}
     LIMIT 1
  `.execute(db);
  const row = rows.rows[0];
  if (!row) return null;

  const dep = readRecord(row.lookup_config, "dependent_filter");
  const refConfig = row.reference_config ?? {};
  const staticFilters = readRecord(row.lookup_config, "filters");

  const emptyBehavior = readStr(dep, "empty_behavior");
  const emptyBehaviorTyped: "none" | "all" | undefined =
    emptyBehavior === "all" ? "all" : emptyBehavior === "none" ? "none" : undefined;

  return {
    dependentFilter: dep ? {
      source_field: readStr(dep, "source_field") ?? undefined,
      target_field: readStr(dep, "target_field") ?? undefined,
      ...(emptyBehaviorTyped ? { empty_behavior: emptyBehaviorTyped } : {}),
    } : null,
    staticFilters,
    referenceEntity:     readStr(refConfig, "target_entity")
                          ?? readStr(refConfig, "ref_entity")
                          ?? readStr(row.validation, "ref_entity"),
    referenceValueField: readStr(refConfig, "value_field")
                          ?? readStr(refConfig, "target_field")
                          ?? "id",
  };
}

function readRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const inner = (value as Record<string, unknown>)[key];
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;
  return inner as Record<string, unknown>;
}

function readStr(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = (value as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// =============================================================================
// BFF on-load hydration — surfaces `_dependency_warnings` on the detail GET
// response so the picker UI can show "needs review" instead of clearing
// silently. Spec: docs/specs/entity_field_defaults.md §5 (bff_on_load_hydrate)
// =============================================================================

export interface DependencyWarning {
  action:  "refilter" | "validate" | "warn";
  sources: string[];
  reason:  "target_stale";
  message?: string;
}

export type DependencyWarningsMap = Record<string, DependencyWarning>;

export interface ComputeBffDependencyWarningsArgs {
  entityCode:       string;
  row:              Readonly<Record<string, unknown>>;
  db:               AnyDb;
  tenantId:         string;
  defaultsByField?: Readonly<Record<string, EntityFieldDefaults>>;
}

/**
 * For each field with a `refilter`/`validate`/`warn` rule including the
 * `bff_on_load_hydrate` layer, check whether the row's target value still
 * matches its source row-side. Returns a map of warning entries.
 *
 * Note: warn/validate without an explicit dependent_filter aren't checkable
 * here (we'd need a custom predicate). For v1 we only flag `refilter` and
 * downgrade other rules to silent.
 */
export async function computeBffDependencyWarnings(
  args: ComputeBffDependencyWarningsArgs,
): Promise<DependencyWarningsMap> {
  const defaultsByField = args.defaultsByField
    ?? await loadEntityFieldDefaults(args.db, args.entityCode);
  if (Object.keys(defaultsByField).length === 0) return {};

  const out: DependencyWarningsMap = {};

  for (const [target, defaults] of Object.entries(defaultsByField)) {
    const rules = defaults?.on_source_change;
    if (!rules) continue;

    for (const rule of rules) {
      if (!rule.layers.includes("bff_on_load_hydrate")) continue;
      if (rule.action !== "refilter" && rule.action !== "validate" && rule.action !== "warn") continue;

      const targetValue = args.row[target];
      if (isBlank(targetValue)) continue;

      // For refilter / validate, attempt a row-side dependent_filter check.
      // For warn, only flag when the source changed away from the target
      // row-side value (best-effort: same check as refilter).
      const passes = await targetPassesDependentFilter({
        db: args.db,
        tenantId: args.tenantId,
        entityCode: args.entityCode,
        targetField: target,
        targetValue: targetValue,
        rowValuesPostMerge: args.row,
        defaults,
      });
      if (passes) continue;

      out[target] = {
        action:  rule.action,
        sources: rule.sources,
        reason:  "target_stale",
        ...(rule.message ? { message: rule.message } : {}),
      };
      break; // first matching rule per target wins
    }
  }

  return out;
}

/**
 * Builds the standardized 422 response payload from a list of errors.
 */
export function buildSourceChangeErrorPayload(errors: SourceChangeError[]): {
  error:  SourceChangeErrorCode;
  fields: Record<string, { action: string; sources: string[]; reason: string; message?: string }>;
} {
  // Use the first error's code as the top-level discriminator. When multiple
  // codes mix, prefer LOCKED > INVALID > STALE > REFILTER (severity order).
  const codePriority: Record<SourceChangeErrorCode, number> = {
    FIELD_LOCKED:                   1,
    FIELD_DEPENDENCY_INVALID:       2,
    FIELD_DEPENDENCY_STALE:         3,
    FIELD_DEPENDENCY_REFILTER_FAIL: 4,
  };
  const sorted = [...errors].sort((a, b) => codePriority[a.code] - codePriority[b.code]);
  const top = sorted[0]?.code ?? "FIELD_DEPENDENCY_STALE";

  const fields: Record<string, { action: string; sources: string[]; reason: string; message?: string }> = {};
  for (const err of errors) {
    fields[err.field] = {
      action:  actionFromCode(err.code),
      sources: err.sources,
      reason:  err.reason,
      message: err.message,
    };
  }
  return { error: top, fields };
}

function actionFromCode(code: SourceChangeErrorCode): string {
  switch (code) {
    case "FIELD_DEPENDENCY_STALE":         return "clear";
    case "FIELD_DEPENDENCY_REFILTER_FAIL": return "refilter";
    case "FIELD_DEPENDENCY_INVALID":       return "validate";
    case "FIELD_LOCKED":                   return "lock";
  }
}
