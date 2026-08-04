import { sql, type Kysely, type Transaction } from "kysely";
import {
  previewNumberingPolicy,
  validateNumberingPolicy,
  type NumberingAllocationCommand,
  type NumberingAllocationResult,
  type NumberingPlane,
  type NumberingPolicyContract,
} from "@athyper/numbering-policy-contracts";

type Database = Record<string, never>;
type Executor = Kysely<Database> | Transaction<Database>;

interface PolicyRow {
  id: string;
  policy_code: string;
  policy_revision: number;
  name: string;
  description: string | null;
  format_template: string;
  sequence_width: number;
  pad_character: string;
  start_value: string | number;
  increment_by: number;
  maximum_value: string | number | null;
  scope_kind: NumberingPolicyContract["scopeKind"];
  reset_kind: NumberingPolicyContract["resetKind"];
  timezone_code: string | null;
  status: NumberingPolicyContract["status"];
}

interface CounterRow {
  id: string;
  next_value: string | number;
  row_version: string | number;
}

interface AdvancedCounterRow {
  row_version: string | number;
  last_allocated_at: Date | string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export class NumberingAllocationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "NumberingAllocationError";
  }
}

function requiredUuid(value: string, code: string): string {
  if (!UUID_PATTERN.test(value)) throw new NumberingAllocationError(code, `${code} must be a UUID.`, 400);
  return value;
}

function safeInteger(value: string | number, code: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new NumberingAllocationError(code, `${code} exceeds the safe allocation range.`, 500);
  return result;
}

function contract(row: PolicyRow): NumberingPolicyContract {
  return {
    policyCode: row.policy_code,
    policyRevision: row.policy_revision,
    name: row.name,
    description: row.description,
    formatTemplate: row.format_template,
    sequenceWidth: row.sequence_width,
    padCharacter: row.pad_character,
    startValue: safeInteger(row.start_value, "POLICY_START_VALUE_INVALID"),
    incrementBy: row.increment_by,
    maximumValue: row.maximum_value === null ? null : safeInteger(row.maximum_value, "POLICY_MAXIMUM_VALUE_INVALID"),
    scopeKind: row.scope_kind,
    resetKind: row.reset_kind,
    timezoneCode: row.timezone_code,
    status: row.status,
  };
}

export class PostgresNumberingAllocationService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly plane: NumberingPlane,
  ) {}

  allocate(command: NumberingAllocationCommand): Promise<NumberingAllocationResult> {
    return this.db.transaction().execute((transaction) => this.allocateWithinTransaction(transaction, command));
  }

  async allocateWithinTransaction(
    transaction: Transaction<Database>,
    command: NumberingAllocationCommand,
  ): Promise<NumberingAllocationResult> {
    if (command.targetPlane !== this.plane) {
      throw new NumberingAllocationError("NUMBERING_PLANE_MISMATCH", `Allocator ${this.plane} cannot allocate ${command.targetPlane} numbering.`, 422);
    }
    const tenantId = requiredUuid(command.tenantId, "TENANT_ID_INVALID");
    const principalId = requiredUuid(command.principalId, "PRINCIPAL_ID_INVALID");
    const allocationId = requiredUuid(command.allocationId, "ALLOCATION_ID_INVALID");
    const correlationId = command.correlationId ? requiredUuid(command.correlationId, "CORRELATION_ID_INVALID") : null;
    if (!Number.isSafeInteger(command.policyRevision) || command.policyRevision < 1) {
      throw new NumberingAllocationError("POLICY_REVISION_INVALID", "policyRevision must be a positive integer.", 400);
    }

    await sql`SELECT set_config('app.current_tenant_id',${tenantId},true),
      set_config('app.current_principal_id',${principalId},true),
      set_config('app.database_plane',${this.plane},true)`.execute(transaction);

    const policyResult = await sql<PolicyRow>`
      SELECT id,policy_code,policy_revision,name,description,format_template,sequence_width,pad_character,
             start_value,increment_by,maximum_value,scope_kind,reset_kind,timezone_code,status
        FROM control.numbering_policy
       WHERE policy_code=${command.policyCode} AND policy_revision=${command.policyRevision}
         AND status='active' AND (tenant_id=${tenantId}::uuid OR tenant_id IS NULL)
       ORDER BY (tenant_id IS NOT NULL) DESC
       LIMIT 1
    `.execute(transaction);
    const policyRow = policyResult.rows[0];
    if (!policyRow) throw new NumberingAllocationError("NUMBERING_POLICY_NOT_FOUND", "No active numbering policy revision resolves for this tenant.", 404);
    const policy = contract(policyRow);
    const policyProblems = validateNumberingPolicy(policy);
    if (policyProblems.length) {
      throw new NumberingAllocationError("NUMBERING_POLICY_INVALID", `Numbering policy is invalid: ${policyProblems.join(", ")}`, 422);
    }
    const scopeKey = policy.scopeKind === "tenant" ? tenantId : command.scopeKey?.trim();
    if (!scopeKey) throw new NumberingAllocationError("NUMBERING_SCOPE_REQUIRED", `scopeKey is required for ${policy.scopeKind} numbering.`, 422);
    if (scopeKey.length > 512) throw new NumberingAllocationError("NUMBERING_SCOPE_INVALID", "scopeKey cannot exceed 512 characters.", 422);

    let initialPreview;
    try {
      initialPreview = previewNumberingPolicy(policy, {
        nextValue: policy.startValue,
        occurredAt: command.occurredAt,
        scopeKey,
        fiscalYear: command.fiscalYear,
      });
    } catch (error) {
      throw new NumberingAllocationError("NUMBERING_CONTEXT_INVALID", error instanceof Error ? error.message : "Invalid numbering context.", 422);
    }

    await sql`
      INSERT INTO runtime_meta.entity_number_counter (
        tenant_id,numbering_policy_id,scope_key,reset_bucket,next_value,created_by
      ) VALUES (
        ${tenantId}::uuid,${policyRow.id}::uuid,${scopeKey},${initialPreview.resetBucket},${policy.startValue},${principalId}::uuid
      ) ON CONFLICT ON CONSTRAINT entity_number_counter_partition_uq DO NOTHING
    `.execute(transaction);

    const counterResult = await sql<CounterRow>`
      SELECT id,next_value,row_version
        FROM runtime_meta.entity_number_counter
       WHERE tenant_id=${tenantId}::uuid AND numbering_policy_id=${policyRow.id}::uuid
         AND scope_key=${scopeKey} AND reset_bucket=${initialPreview.resetBucket}
       FOR UPDATE
    `.execute(transaction);
    const counter = counterResult.rows[0];
    if (!counter) throw new NumberingAllocationError("NUMBERING_COUNTER_NOT_FOUND", "Counter partition could not be locked.", 500);
    const nextValue = safeInteger(counter.next_value, "COUNTER_VALUE_INVALID");
    if (policy.maximumValue !== null && nextValue > policy.maximumValue) {
      throw new NumberingAllocationError("NUMBERING_POLICY_EXHAUSTED", "The numbering policy has no remaining values in this partition.", 409);
    }
    let preview;
    try {
      preview = previewNumberingPolicy(policy, {
        nextValue,
        occurredAt: command.occurredAt,
        scopeKey,
        fiscalYear: command.fiscalYear,
      });
    } catch (error) {
      throw new NumberingAllocationError("NUMBERING_CONTEXT_INVALID", error instanceof Error ? error.message : "Invalid numbering context.", 422);
    }

    const advanced = await sql<AdvancedCounterRow>`
      UPDATE runtime_meta.entity_number_counter
         SET next_value=${preview.followingValue},allocation_count=allocation_count+1,row_version=row_version+1,
             last_allocated_value=${preview.nextValue},last_allocation_id=${allocationId}::uuid,
             last_allocated_at=clock_timestamp(),last_allocated_by=${principalId}::uuid,
             last_correlation_id=${correlationId}::uuid,updated_by=${principalId}::uuid
       WHERE id=${counter.id}::uuid
       RETURNING row_version,last_allocated_at
    `.execute(transaction);
    const result = advanced.rows[0];
    if (!result) throw new NumberingAllocationError("NUMBERING_COUNTER_ADVANCE_FAILED", "Counter allocation did not advance.", 500);
    return {
      allocationId,
      tenantId,
      policyId: policyRow.id,
      counterId: counter.id,
      policyCode: policy.policyCode,
      policyRevision: policy.policyRevision,
      formattedNumber: preview.formattedNumber,
      allocatedValue: preview.nextValue,
      followingValue: preview.followingValue,
      scopeKey,
      resetBucket: preview.resetBucket,
      rowVersion: safeInteger(result.row_version, "COUNTER_ROW_VERSION_INVALID"),
      allocatedAt: new Date(result.last_allocated_at).toISOString(),
    };
  }
}
