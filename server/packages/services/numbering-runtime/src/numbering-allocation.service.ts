import { sql, type Kysely, type Transaction } from "kysely";
import {
  extractRequiredContextKeys,
  previewNumberingPolicy,
  validateNumberingPolicy,
  NumberingAllocationError,
  NumberingConflictError,
  NumberingExhaustedError,
  type NumberingAllocationCommand,
  type NumberingAllocationResult,
  type NumberingBatchAllocationCommand,
  type NumberingBatchAllocationResult,
  type NumberingPlane,
} from "@athyper/numbering-contracts";
import { rowToContract, safeInteger, type CounterRow, type PolicyRow } from "./mappers.js";

type Database = Record<string, never>;
type Executor = Kysely<Database> | Transaction<Database>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function requiredUuid(value: string, code: string): string {
  if (!UUID_PATTERN.test(value)) throw new NumberingAllocationError(code, `${code} must be a valid UUID.`, 400);
  return value;
}

export class NumberingAllocationService {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly plane: NumberingPlane,
  ) {}

  allocate(command: NumberingAllocationCommand): Promise<NumberingAllocationResult> {
    return this.db.transaction().execute((tx) => this.allocateWithinTransaction(tx, command));
  }

  async allocateWithinTransaction(
    transaction: Transaction<Database>,
    command: NumberingAllocationCommand,
  ): Promise<NumberingAllocationResult> {
    if (command.targetPlane !== this.plane) {
      throw new NumberingAllocationError("NUMBERING_PLANE_MISMATCH", `Allocator "${this.plane}" cannot allocate "${command.targetPlane}" numbering.`, 422);
    }

    const tenantId      = requiredUuid(command.tenantId,     "TENANT_ID_INVALID");
    const principalId   = requiredUuid(command.principalId,  "PRINCIPAL_ID_INVALID");
    const allocationId  = requiredUuid(command.allocationId, "ALLOCATION_ID_INVALID");
    const correlationId = command.correlationId ? requiredUuid(command.correlationId, "CORRELATION_ID_INVALID") : null;

    if (!Number.isSafeInteger(command.policyRevision) || command.policyRevision < 1) {
      throw new NumberingAllocationError("POLICY_REVISION_INVALID", "policyRevision must be a positive integer.", 400);
    }

    await sql`SELECT
        set_config('app.current_tenant_id',  ${tenantId},    true),
        set_config('app.current_principal_id',${principalId}, true),
        set_config('app.database_plane',      ${this.plane},  true)
    `.execute(transaction);

    const policyResult = await sql<PolicyRow>`
      SELECT id, policy_code, policy_revision, name, description, format_template,
             sequence_width, pad_character, start_value, increment_by, maximum_value,
             scope_kind, reset_kind, display_reset_kind, fiscal_year_pattern,
             max_output_length, timezone_code, status, activated_at, activated_by
        FROM control.numbering_policy
       WHERE policy_code     = ${command.policyCode}
         AND policy_revision = ${command.policyRevision}
         AND status          = 'active'
         AND (tenant_id = ${tenantId}::uuid OR tenant_id IS NULL)
       ORDER BY (tenant_id IS NOT NULL) DESC
       LIMIT 1
    `.execute(transaction);

    const policyRow = policyResult.rows[0];
    if (!policyRow) throw new NumberingAllocationError("NUMBERING_POLICY_NOT_FOUND", "No active numbering policy revision resolves for this tenant.", 404);

    const policy = rowToContract(policyRow);
    const problems = validateNumberingPolicy(policy);
    if (problems.length) throw new NumberingAllocationError("NUMBERING_POLICY_INVALID", `Numbering policy is invalid: ${problems.join(", ")}`, 422);

    // Validate contextFields completeness before touching the counter
    const requiredCtxKeys = extractRequiredContextKeys(policy);
    const missingCtxKeys  = requiredCtxKeys.filter((k) => !command.contextFields?.[k]);
    if (missingCtxKeys.length) {
      throw new NumberingAllocationError("MISSING_CONTEXT_FIELD", `Missing contextFields: ${missingCtxKeys.join(", ")}`, 422);
    }

    // Validate fiscalYearPattern
    if (policy.fiscalYearPattern && command.fiscalYear) {
      if (!new RegExp(policy.fiscalYearPattern, "u").test(command.fiscalYear)) {
        throw new NumberingAllocationError("FISCAL_YEAR_PATTERN_MISMATCH", `fiscalYear does not match policy pattern: ${policy.fiscalYearPattern}`, 422);
      }
    }

    const scopeKey = policy.scopeKind === "tenant" ? tenantId : command.scopeKey?.trim();
    if (!scopeKey) throw new NumberingAllocationError("NUMBERING_SCOPE_REQUIRED", `scopeKey is required for "${policy.scopeKind}" numbering.`, 422);
    if (scopeKey.length > 128) throw new NumberingAllocationError("NUMBERING_SCOPE_TOO_LONG", "scopeKey cannot exceed 128 characters.", 422);

    const previewContext = {
      nextValue:     policy.startValue,
      occurredAt:    command.occurredAt,
      scopeKey,
      fiscalYear:    command.fiscalYear,
      contextFields: command.contextFields,
    };

    let initialPreview;
    try {
      initialPreview = previewNumberingPolicy(policy, previewContext);
    } catch (error) {
      throw new NumberingAllocationError("NUMBERING_CONTEXT_INVALID", error instanceof Error ? error.message : "Invalid numbering context.", 422);
    }

    // Ensure the counter partition exists
    await sql`
      INSERT INTO runtime_meta.entity_number_counter (
        tenant_id, numbering_policy_id, scope_key, reset_bucket, next_value, created_by
      ) VALUES (
        ${tenantId}::uuid, ${policyRow.id}::uuid, ${scopeKey},
        ${initialPreview.resetBucket}, ${policy.startValue}, ${principalId}::uuid
      ) ON CONFLICT ON CONSTRAINT entity_number_counter_partition_uq DO NOTHING
    `.execute(transaction);

    const counterResult = await sql<CounterRow>`
      SELECT id, next_value, row_version, last_allocation_id, last_allocated_value, last_allocated_at, last_allocated_by
        FROM runtime_meta.entity_number_counter
       WHERE tenant_id           = ${tenantId}::uuid
         AND numbering_policy_id = ${policyRow.id}::uuid
         AND scope_key           = ${scopeKey}
         AND reset_bucket        = ${initialPreview.resetBucket}
       FOR UPDATE
    `.execute(transaction);

    const counter = counterResult.rows[0];
    if (!counter) throw new NumberingAllocationError("NUMBERING_COUNTER_NOT_FOUND", "Counter partition could not be locked.", 500);

    // Idempotency check — same allocationId already committed, return previous result
    if (counter.last_allocation_id === allocationId) {
      const prevValue = safeInteger(counter.last_allocated_value ?? policy.startValue, "COUNTER_VALUE_INVALID");
      const prevPreview = previewNumberingPolicy(policy, { ...previewContext, nextValue: prevValue });
      return {
        allocationId,
        tenantId,
        policyId:          policyRow.id,
        counterId:         counter.id,
        policyCode:        policy.policyCode,
        policyRevision:    policy.policyRevision,
        formattedNumber:   prevPreview.formattedNumber,
        allocatedValue:    prevValue,
        followingValue:    prevPreview.followingValue,
        scopeKey,
        resetBucket:       prevPreview.resetBucket,
        rowVersion:        safeInteger(counter.row_version, "COUNTER_ROW_VERSION_INVALID"),
        allocatedAt:       new Date(counter.last_allocated_at as string).toISOString(),
        idempotencySource: "replayed",
      };
    }

    const nextValue = safeInteger(counter.next_value, "COUNTER_VALUE_INVALID");
    if (policy.maximumValue != null && nextValue > policy.maximumValue) {
      throw new NumberingExhaustedError(policy.policyCode, scopeKey);
    }

    let preview;
    try {
      preview = previewNumberingPolicy(policy, { ...previewContext, nextValue });
    } catch (error) {
      throw new NumberingAllocationError("NUMBERING_CONTEXT_INVALID", error instanceof Error ? error.message : "Invalid numbering context.", 422);
    }

    const advanced = await sql<{ row_version: string | number; last_allocated_at: Date | string }>`
      UPDATE runtime_meta.entity_number_counter
         SET next_value          = ${preview.followingValue},
             allocation_count    = allocation_count + 1,
             row_version         = row_version + 1,
             last_allocated_value= ${preview.nextValue},
             last_allocation_id  = ${allocationId}::uuid,
             last_allocated_at   = clock_timestamp(),
             last_allocated_by   = ${principalId}::uuid,
             last_correlation_id = ${correlationId}::uuid,
             updated_by          = ${principalId}::uuid
       WHERE id = ${counter.id}::uuid
       RETURNING row_version, last_allocated_at
    `.execute(transaction);

    const result = advanced.rows[0];
    if (!result) throw new NumberingAllocationError("NUMBERING_COUNTER_ADVANCE_FAILED", "Counter allocation did not advance.", 500);

    return {
      allocationId,
      tenantId,
      policyId:          policyRow.id,
      counterId:         counter.id,
      policyCode:        policy.policyCode,
      policyRevision:    policy.policyRevision,
      formattedNumber:   preview.formattedNumber,
      allocatedValue:    preview.nextValue,
      followingValue:    preview.followingValue,
      scopeKey,
      resetBucket:       preview.resetBucket,
      rowVersion:        safeInteger(result.row_version, "COUNTER_ROW_VERSION_INVALID"),
      allocatedAt:       new Date(result.last_allocated_at as string).toISOString(),
      idempotencySource: "fresh",
    };
  }

  async allocateBatch(command: NumberingBatchAllocationCommand): Promise<NumberingBatchAllocationResult> {
    const allocations: NumberingAllocationResult[] = [];
    const failedItems: { allocationId: string; error: string }[] = [];

    await this.db.transaction().execute(async (tx) => {
      for (const item of command.items) {
        try {
          const result = await this.allocateWithinTransaction(tx, {
            targetPlane:    command.targetPlane,
            policyCode:     command.policyCode,
            policyRevision: command.policyRevision,
            tenantId:       command.tenantId,
            principalId:    command.principalId,
            occurredAt:     command.occurredAt,
            allocationId:   item.allocationId,
            scopeKey:       item.scopeKey,
            fiscalYear:     item.fiscalYear,
            contextFields:  item.contextFields,
          });
          allocations.push(result);
        } catch (error) {
          failedItems.push({
            allocationId: item.allocationId,
            error:        error instanceof Error ? error.message : String(error),
          });
        }
      }
    });

    return { allocations, failedItems };
  }
}

// Re-export error classes so service consumers can import from one place
export { NumberingAllocationError, NumberingConflictError, NumberingExhaustedError } from "@athyper/numbering-contracts";
