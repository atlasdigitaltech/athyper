import { sql, type Kysely } from "kysely";
import {
  previewNumberingPolicy,
  validateNumberingPolicy,
  type NumberingPlane,
  type NumberingPolicyContract,
  type NumberingPolicyTestCommand,
  type NumberingPolicyTestResult,
} from "@athyper/numbering-policy-contracts";
import { NumberingAllocationError } from "./postgres-numbering-allocation.service.js";

type Database = Record<string, never>;

interface PolicyRow {
  id: string;
  tenant_id: string | null;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function integer(value: string | number, code: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new NumberingAllocationError(code, `${code} exceeds the safe preview range.`, 422);
  return result;
}

function policyContract(row: PolicyRow): NumberingPolicyContract {
  return {
    policyCode: row.policy_code,
    policyRevision: row.policy_revision,
    name: row.name,
    description: row.description,
    formatTemplate: row.format_template,
    sequenceWidth: row.sequence_width,
    padCharacter: row.pad_character,
    startValue: integer(row.start_value, "POLICY_START_VALUE_INVALID"),
    incrementBy: row.increment_by,
    maximumValue: row.maximum_value === null ? null : integer(row.maximum_value, "POLICY_MAXIMUM_VALUE_INVALID"),
    scopeKind: row.scope_kind,
    resetKind: row.reset_kind,
    timezoneCode: row.timezone_code,
    status: row.status,
  };
}

/** Read-only policy tester. This service deliberately has no dependency on runtime_meta. */
export class PostgresNumberingPolicyTester {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly plane: NumberingPlane,
  ) {}

  async test(command: NumberingPolicyTestCommand): Promise<NumberingPolicyTestResult> {
    if (command.targetPlane !== this.plane) {
      throw new NumberingAllocationError("NUMBERING_PLANE_MISMATCH", `Tester ${this.plane} cannot test ${command.targetPlane} numbering.`, 422);
    }
    if (!UUID_PATTERN.test(command.tenantId) || !UUID_PATTERN.test(command.principalId)) {
      throw new NumberingAllocationError("NUMBERING_ACTOR_CONTEXT_INVALID", "A valid tenant and principal are required.", 400);
    }
    return this.db.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT set_config('app.current_tenant_id',${command.tenantId},true),
        set_config('app.current_principal_id',${command.principalId},true),
        set_config('app.database_plane',${this.plane},true)`.execute(tx);
      const result = await sql<PolicyRow>`
        SELECT id,tenant_id,policy_code,policy_revision,name,description,format_template,sequence_width,
               pad_character,start_value,increment_by,maximum_value,scope_kind,reset_kind,timezone_code,status
          FROM control.numbering_policy
         WHERE policy_code=${command.policyCode} AND policy_revision=${command.policyRevision}
           AND status='active' AND (tenant_id=${command.tenantId}::uuid OR tenant_id IS NULL)
         ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1
      `.execute(tx);
      const row = result.rows[0];
      if (!row) throw new NumberingAllocationError("NUMBERING_POLICY_NOT_FOUND", "No active numbering policy revision resolves for this tenant.", 404);
      const policy = policyContract(row);
      const diagnosticCodes = validateNumberingPolicy(policy);
      if (diagnosticCodes.length) {
        throw new NumberingAllocationError("NUMBERING_POLICY_INVALID", `Numbering policy is invalid: ${diagnosticCodes.join(", ")}`, 422);
      }
      const input = {
        nextValue: command.nextValue,
        occurredAt: command.occurredAt,
        scopeKey: command.scopeKey ?? null,
        fiscalYear: command.fiscalYear ?? null,
      };
      try {
        return {
          targetPlane: this.plane,
          tenantId: command.tenantId,
          policyId: row.id,
          policySource: row.tenant_id === null ? "global" : "tenant",
          policy,
          input,
          preview: previewNumberingPolicy(policy, input),
          diagnosticCodes: [],
        };
      } catch (error) {
        throw new NumberingAllocationError("NUMBERING_PREVIEW_INVALID", error instanceof Error ? error.message : "Numbering preview failed.", 422);
      }
    });
  }
}
