import { sql, type Kysely } from "kysely";
import {
  extractRequiredContextKeys,
  simulateSteps,
  validateNumberingPolicy,
  NumberingAllocationError,
  NUMBERING_CONFIG,
  type NumberingPlane,
  type NumberingPreviewContext,
  type NumberingPolicyTestCommand,
  type NumberingPolicyTestResult,
} from "@athyper/numbering-contracts";
import { rowToContract, type PolicyRow } from "./mappers.js";

type Database = Record<string, never>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Read-only policy tester. Never touches runtime_meta counters. */
export class NumberingPolicyTester {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly plane: NumberingPlane,
  ) {}

  async test(command: NumberingPolicyTestCommand): Promise<NumberingPolicyTestResult> {
    if (command.targetPlane !== this.plane) {
      throw new NumberingAllocationError("NUMBERING_PLANE_MISMATCH", `Tester "${this.plane}" cannot test "${command.targetPlane}" numbering.`, 422);
    }
    if (!UUID_PATTERN.test(command.tenantId) || !UUID_PATTERN.test(command.principalId)) {
      throw new NumberingAllocationError("NUMBERING_ACTOR_CONTEXT_INVALID", "A valid tenantId and principalId are required.", 400);
    }

    return this.db.transaction().execute(async (tx) => {
      await sql`SET TRANSACTION READ ONLY`.execute(tx);
      await sql`SELECT
          set_config('app.current_tenant_id',  ${command.tenantId},   true),
          set_config('app.current_principal_id',${command.principalId},true),
          set_config('app.database_plane',      ${this.plane},         true)
      `.execute(tx);

      const result = await sql<PolicyRow>`
        SELECT id, tenant_id, policy_code, policy_revision, name, description, format_template,
               sequence_width, pad_character, start_value, increment_by, maximum_value,
               scope_kind, reset_kind, display_reset_kind, fiscal_year_pattern,
               max_output_length, timezone_code, status, activated_at, activated_by
          FROM control.numbering_policy
         WHERE policy_code     = ${command.policyCode}
           AND policy_revision = ${command.policyRevision}
           AND status          = 'active'
           AND (tenant_id = ${command.tenantId}::uuid OR tenant_id IS NULL)
         ORDER BY (tenant_id IS NOT NULL) DESC LIMIT 1
      `.execute(tx);

      const row = result.rows[0];
      if (!row) throw new NumberingAllocationError("NUMBERING_POLICY_NOT_FOUND", "No active numbering policy revision resolves for this tenant.", 404);

      const policy         = rowToContract(row);
      const diagnosticCodes = validateNumberingPolicy(policy);

      // Resolve effective context — testContext supersedes top-level fields
      const effectiveCtx: NumberingPreviewContext = command.testContext
        ? {
            nextValue:     command.testContext.nextValue,
            occurredAt:    command.testContext.occurredAt,
            scopeKey:      command.testContext.scopeKey ?? command.scopeKey ?? null,
            fiscalYear:    command.testContext.fiscalYear ?? command.fiscalYear ?? null,
            contextFields: command.testContext.contextFields,
          }
        : {
            nextValue:    command.nextValue,
            occurredAt:   command.occurredAt,
            scopeKey:     command.scopeKey ?? null,
            fiscalYear:   command.fiscalYear ?? null,
            contextFields: undefined,
          };

      // Context field diagnostics
      const requiredCtxKeys    = extractRequiredContextKeys(policy);
      const missingCtxKeys     = requiredCtxKeys.filter((k) => !effectiveCtx.contextFields?.[k]);

      // Fiscal year pattern diagnostic
      let fiscalYearValid: boolean | undefined;
      if (policy.fiscalYearPattern && effectiveCtx.fiscalYear) {
        fiscalYearValid = new RegExp(policy.fiscalYearPattern, "u").test(effectiveCtx.fiscalYear);
      }

      // Exhaustion info
      let allocationsRemaining: number | null = null;
      if (policy.maximumValue != null) {
        const remaining = Math.floor((policy.maximumValue - effectiveCtx.nextValue) / policy.incrementBy) + 1;
        allocationsRemaining = Math.max(0, remaining);
      }

      // Simulate steps
      const stepCount = Math.min(
        command.options?.previewSteps ?? NUMBERING_CONFIG.defaultPreviewSteps,
        NUMBERING_CONFIG.maxPreviewSteps,
      );

      let sequence = [] as ReturnType<typeof simulateSteps>;
      try {
        sequence = simulateSteps(policy, effectiveCtx, stepCount, command.options?.simulateResetAt);
      } catch {
        // preview errors surface in diagnosticCodes — sequence stays empty
      }

      // Reset boundary info (derived from sequence if boundary was crossed)
      const boundaryStep   = sequence.find((s) => s.crossedBoundary);
      const preBoundary    = boundaryStep ? sequence[boundaryStep.stepNumber - 2] : undefined;
      const resetBoundaryInfo = boundaryStep && preBoundary
        ? {
            lastValueBeforeReset:  preBoundary.allocatedValue,
            firstValueAfterReset:  boundaryStep.allocatedValue,
          }
        : undefined;

      const firstStep = sequence[0];

      // Sync fallback — compute inline if no sequence
      let safeLegacyPreview;
      if (firstStep) {
        safeLegacyPreview = {
          formattedNumber:    firstStep.formattedNumber,
          sequenceText:       firstStep.sequenceText,
          nextValue:          firstStep.allocatedValue,
          followingValue:     firstStep.followingValue,
          resetBucket:        firstStep.resetBucket,
          displayResetBucket: firstStep.resetBucket,
        };
      } else {
        // Policy is invalid — synthetic preview to satisfy result shape
        safeLegacyPreview = {
          formattedNumber:    "",
          sequenceText:       "",
          nextValue:          effectiveCtx.nextValue,
          followingValue:     effectiveCtx.nextValue + policy.incrementBy,
          resetBucket:        "never",
          displayResetBucket: "never",
        };
      }

      return {
        targetPlane:    this.plane,
        tenantId:       command.tenantId,
        policyId:       row.id,
        policySource:   (row.tenant_id == null ? "global" : "tenant") as NumberingPolicyTestResult["policySource"],
        policy,
        input:          effectiveCtx,
        preview:        safeLegacyPreview,
        sequence,
        diagnostics: {
          codes:                diagnosticCodes,
          fiscalYearValid,
          contextFieldsMissing: missingCtxKeys,
          exhaustionInfo:       { allocationsRemaining },
          resetBoundaryInfo,
        },
        diagnosticCodes,
      };
    });
  }
}

// ─── Type alias for backward compat import ────────────────────────────────────
export type { NumberingPolicyTestResult };
