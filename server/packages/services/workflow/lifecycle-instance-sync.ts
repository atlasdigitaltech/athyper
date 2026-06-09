import { evaluateRuntimeCondition } from "./gate-evaluator.js";
import { normalizeEntityName } from "./entity-adapter-registry.js";
import { normalizeLifecycleStateCode } from "./lifecycle-state-code.js";
import type {
  WorkflowRuntimeDb,
  WorkflowRuntimeLogger,
  WorkflowRuntimeTransaction,
} from "./runtime.types.js";

const SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface SyncLifecycleInstanceParams {
  db: WorkflowRuntimeDb | WorkflowRuntimeTransaction;
  tenantId: string;
  entityName: string;
  entityId: string;
  status: string;
  actorId?: string | null;
  payload?: Record<string, unknown>;
  logger?: WorkflowRuntimeLogger;
}

export interface SyncLifecycleInstanceResult {
  synced: boolean;
  reason?: "binding_not_found" | "condition_error";
  lifecycleId?: string;
  stateId?: string;
  stateCode?: string;
}

interface LifecycleBindingRow {
  lifecycle_id: string;
  state_id: string;
  state_code: string;
  conditions: unknown;
}

export async function syncLifecycleInstanceForStatus(
  params: SyncLifecycleInstanceParams,
): Promise<SyncLifecycleInstanceResult> {
  const entityName = normalizeEntityName(params.entityName);
  const stateCode = normalizeLifecycleStateCode(params.status);
  const payload = {
    ...(params.payload ?? {}),
    tenant_id: params.tenantId,
    entity_name: entityName,
    entity_id: params.entityId,
    status: stateCode,
  };

  const bindings = await loadLifecycleBindings(params.db, {
    tenantId: params.tenantId,
    entityName,
    stateCode,
  });
  let binding: LifecycleBindingRow | undefined;
  let hadConditionError = false;
  for (const row of bindings) {
    const match = bindingMatches(row, payload, params.logger);
    if (match.conditionError) hadConditionError = true;
    if (match.matches) {
      binding = row;
      break;
    }
  }

  if (!binding) {
    return {
      synced: false,
      reason: hadConditionError ? "condition_error" : "binding_not_found",
    };
  }

  const actorId = params.actorId ?? SYSTEM_ACTOR;
  const now = new Date();

  await params.db
    .insertInto("master.lifecycle_instance" as never)
    .values({
      tenant_id: params.tenantId,
      entity_name: entityName,
      entity_id: params.entityId,
      lifecycle_id: binding.lifecycle_id,
      state_id: binding.state_id,
      created_by: actorId,
      updated_by: actorId,
    } as never)
    .onConflict((oc) => oc
      .columns(["tenant_id", "entity_name", "entity_id", "lifecycle_id"] as never)
      .doUpdateSet({
        state_id: binding.state_id,
        updated_at: now,
        updated_by: actorId,
      } as never))
    .execute();

  return {
    synced: true,
    lifecycleId: binding.lifecycle_id,
    stateId: binding.state_id,
    stateCode: binding.state_code,
  };
}

async function loadLifecycleBindings(
  db: WorkflowRuntimeDb | WorkflowRuntimeTransaction,
  params: { tenantId: string; entityName: string; stateCode: string },
): Promise<LifecycleBindingRow[]> {
  return await (db
    .selectFrom("control.entity_lifecycle as el" as never) as any)
    .innerJoin("control.lifecycle as lc" as never, "lc.id" as never, "el.lifecycle_id" as never)
    .innerJoin("control.lifecycle_state as ls" as never, "ls.lifecycle_id" as never, "lc.id" as never)
    .select([
      "el.lifecycle_id as lifecycle_id",
      "el.conditions as conditions",
      "ls.id as state_id",
      "ls.code as state_code",
    ] as never[])
    .where("el.entity_name" as never, "=" as never, params.entityName as never)
    .where("ls.code" as never, "=" as never, params.stateCode as never)
    .where("lc.is_active" as never, "=" as never, true as never)
    .where((eb: any) => eb.or([
      eb("el.tenant_id" as never, "=" as never, params.tenantId as never),
      eb("el.tenant_id" as never, "is" as never, null as never),
    ]))
    .orderBy("el.priority" as never, "asc" as never)
    .orderBy("el.created_at" as never, "asc" as never)
    .execute() as LifecycleBindingRow[];
}

function bindingMatches(
  row: LifecycleBindingRow,
  payload: Record<string, unknown>,
  logger?: WorkflowRuntimeLogger,
): { matches: boolean; conditionError: boolean } {
  const conditions = parseJson(row.conditions);
  if (conditions == null) return { matches: true, conditionError: false };
  try {
    return {
      matches: evaluateRuntimeCondition(conditions, payload),
      conditionError: false,
    };
  } catch (err) {
    logger?.warn?.("lifecycle_binding_condition_error", {
      lifecycleId: row.lifecycle_id,
      reason: "condition_error",
      err: err instanceof Error ? err.message : String(err),
    });
    return { matches: false, conditionError: true };
  }
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
