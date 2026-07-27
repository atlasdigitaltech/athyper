import { Buffer } from "node:buffer";
import { sql } from "kysely";
import type { AnyDb } from "../ai-runtime.types.js";
import {
  ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION,
  ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION,
  ATLAS_TOOL_MANIFEST_SCHEMA_VERSION,
  type AtlasSha256Hex,
  type AtlasToolAuthorizationResolution,
  type AtlasToolEvidenceMetadata,
  type AtlasToolExecutionErrorCode,
  type AtlasToolExecutionProposal,
  type AtlasToolExecutionRecorder,
  type AtlasToolExecutionScope,
  type AtlasToolExecutionTerminal,
  type AtlasToolExecutingTransition,
} from "./atlas-tool.types.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH_RE = /^[0-9a-f]{64}$/;
const TOOL_RE = /^[a-z][a-z0-9_]{2,63}$/;
const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const ACTION_RE = /^[a-z][a-z0-9_.:-]{0,127}$/;
const SAFE_TEXT_RE = /^[^\u0000-\u001f\u007f]+$/;
const PLANES = new Set(["neon", "mesh", "admin"]);
const RISKS = new Set(["unknown", "low", "medium", "high"]);
const AUTONOMY = new Set([
  "not_evaluated",
  "denied",
  "suggest",
  "assist",
  "auto",
]);
const RUNTIME_DISPOSITIONS = new Set([
  "described",
  "not_described",
  "schema_invalid",
]);
const GATES = new Set([
  "not_evaluated",
  "eligible",
  "unknown_tool",
  "tool_disabled",
  "not_described",
  "wrong_plane",
  "permission_denied",
  "feature_disabled",
  "policy_denied",
  "risk_denied",
  "malformed_arguments",
  "cancelled",
  "timeout",
  "control_error",
]);
const ERROR_CODES = new Set<AtlasToolExecutionErrorCode>([
  "INVALID_VERIFIED_CONTEXT",
  "INVALID_INVOCATION",
  "UNKNOWN_TOOL",
  "TOOL_DISABLED",
  "TOOL_NOT_DESCRIBED",
  "WRONG_PLANE",
  "PERMISSION_DENIED",
  "AUTHORIZATION_STALE",
  "FEATURE_DISABLED",
  "POLICY_DENIED",
  "RISK_CEILING_EXCEEDED",
  "MALFORMED_ARGUMENTS",
  "CANCELLED",
  "TIMEOUT",
  "DATA_ACCESS_DENIED",
  "HANDLER_FAILED",
  "MALFORMED_RESULT",
  "RESULT_TOO_LARGE",
  "PROVIDER_TERMINATED",
  "RECORDING_FAILED",
]);

const AUTHORIZATION_JSON_LIMIT = 32_768;
const EVIDENCE_JSON_LIMIT = 65_536;
const SUMMARY_LIMIT = 4_096;
const MAX_PERMISSIONS = 128;
const MAX_EVIDENCE_REFS = 128;
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_500;

type RecorderErrorCode =
  | "INVALID_RECORD"
  | "PROPOSAL_CONFLICT"
  | "TRANSITION_CONFLICT"
  | "DATABASE_ERROR";

interface ProposalStateRow {
  state: string;
}

interface MutationRow {
  id: string;
}

interface SerializedAuthorization {
  toolVersion: string | null;
  actionCode: string | null;
  operationClass: "read" | "unresolved";
  riskClass: "unknown" | "low" | "medium" | "high";
  autonomyDecision:
    | "not_evaluated"
    | "denied"
    | "suggest"
    | "assist"
    | "auto";
  permissionSnapshot: string;
  policySnapshot: string;
  profileSnapshot: string;
  authorizationEpoch: number;
  policyRevision: string;
  profileRevision: string;
  proposalSummary: string;
}

export class SqlAtlasToolExecutionRecorderError extends Error {
  override readonly name = "SqlAtlasToolExecutionRecorderError";

  constructor(readonly code: RecorderErrorCode) {
    super(messageFor(code));
  }
}

export interface SqlAtlasToolExecutionRecorderOptions {
  /** Must remain below the executor audit timeout so late SQL cannot commit. */
  readonly statementTimeoutMs?: number;
}

/**
 * Content-free PostgreSQL recorder for the governed Atlas tool ledger.
 *
 * Every operation stamps the tenant, principal, and plane RLS dimensions.
 * Caller values remain bound Kysely parameters; raw arguments, raw results,
 * confirmation tokens, prompts, and model reasoning are not accepted by this
 * contract or written by this adapter.
 */
export class SqlAtlasToolExecutionRecorder
implements AtlasToolExecutionRecorder {
  private readonly statementTimeoutMs: number;

  constructor(
    private readonly db: AnyDb,
    options: SqlAtlasToolExecutionRecorderOptions = {},
  ) {
    this.statementTimeoutMs = validStatementTimeout(
      options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS,
    );
  }

  async propose(proposal: AtlasToolExecutionProposal): Promise<void> {
    const record = serializeProposal(proposal);
    await this.withScope(proposal, async (trx) => {
      const result = await sql<ProposalStateRow>`
        WITH inserted AS (
          INSERT INTO event.ai_tool_invocation (
            id,
            tenant_id,
            thread_id,
            run_id,
            plane,
            principal_id,
            tool_call_id,
            tool_code,
            tool_version,
            action_code,
            input_hash,
            operation_class,
            risk_class,
            autonomy_decision,
            permission_snapshot,
            policy_snapshot,
            profile_snapshot,
            authorization_epoch,
            policy_revision,
            profile_revision,
            proposal_summary,
            status,
            created_at,
            created_by
          )
          VALUES (
            ${proposal.executionId}::uuid,
            ${proposal.tenantId}::uuid,
            ${proposal.threadId}::uuid,
            ${proposal.runId}::uuid,
            ${proposal.plane},
            ${proposal.principalId}::uuid,
            ${proposal.callId},
            ${proposal.toolName},
            ${record.toolVersion}::text,
            ${record.actionCode}::text,
            ${proposal.argumentHash}::text,
            ${record.operationClass},
            ${record.riskClass},
            ${record.autonomyDecision},
            ${record.permissionSnapshot}::jsonb,
            ${record.policySnapshot}::jsonb,
            ${record.profileSnapshot}::jsonb,
            ${record.authorizationEpoch}::bigint,
            ${record.policyRevision},
            ${record.profileRevision},
            ${record.proposalSummary},
            'proposed',
            ${proposal.proposedAt},
            ${proposal.principalId}::uuid
          )
          ON CONFLICT (tenant_id, run_id, tool_call_id) DO NOTHING
          RETURNING id
        ),
        matching_existing AS (
          SELECT i.id
          FROM event.ai_tool_invocation i
          WHERE NOT EXISTS (SELECT 1 FROM inserted)
            AND i.id = ${proposal.executionId}::uuid
            AND i.tenant_id = ${proposal.tenantId}::uuid
            AND i.thread_id = ${proposal.threadId}::uuid
            AND i.run_id = ${proposal.runId}::uuid
            AND i.plane = ${proposal.plane}
            AND i.principal_id = ${proposal.principalId}::uuid
            AND i.tool_call_id = ${proposal.callId}
            AND i.tool_code = ${proposal.toolName}
            AND i.tool_version IS NOT DISTINCT FROM ${record.toolVersion}::text
            AND i.action_code IS NOT DISTINCT FROM ${record.actionCode}::text
            AND i.input_hash IS NOT DISTINCT FROM ${proposal.argumentHash}::text
            AND i.operation_class = ${record.operationClass}
            AND i.risk_class = ${record.riskClass}
            AND i.autonomy_decision = ${record.autonomyDecision}
            AND i.permission_snapshot = ${record.permissionSnapshot}::jsonb
            AND i.policy_snapshot = ${record.policySnapshot}::jsonb
            AND i.profile_snapshot = ${record.profileSnapshot}::jsonb
            AND i.authorization_epoch = ${record.authorizationEpoch}::bigint
            AND i.policy_revision = ${record.policyRevision}
            AND i.profile_revision = ${record.profileRevision}
            AND i.proposal_summary = ${record.proposalSummary}
            AND i.status = 'proposed'
            AND i.created_by = ${proposal.principalId}::uuid
        )
        SELECT CASE
          WHEN EXISTS (SELECT 1 FROM inserted) THEN 'inserted'
          WHEN EXISTS (SELECT 1 FROM matching_existing) THEN 'matched'
          ELSE 'conflict'
        END AS state
      `.execute(trx);
      const state = result.rows[0]?.state;
      if (state !== "inserted" && state !== "matched") {
        throw new SqlAtlasToolExecutionRecorderError("PROPOSAL_CONFLICT");
      }
    });
  }

  async markExecuting(transition: AtlasToolExecutingTransition): Promise<void> {
    const scope = validateScope(transition.scope);
    const resolution = serializeAuthorization(transition.resolution);
    assertExecutableResolution(resolution);
    const guard = serializeExecutionGuard(transition);
    validDate(transition.executingAt);

    await this.withScope(scope, async (trx) => {
      const result = await sql<MutationRow>`
        UPDATE event.ai_tool_invocation
        SET tool_version = ${resolution.toolVersion},
            action_code = ${resolution.actionCode},
            operation_class = ${resolution.operationClass},
            risk_class = ${resolution.riskClass},
            autonomy_decision = ${resolution.autonomyDecision},
            permission_snapshot = ${resolution.permissionSnapshot}::jsonb,
            policy_snapshot = ${resolution.policySnapshot}::jsonb,
            profile_snapshot = ${resolution.profileSnapshot}::jsonb,
            authorization_epoch = ${resolution.authorizationEpoch}::bigint,
            policy_revision = ${resolution.policyRevision},
            profile_revision = ${resolution.profileRevision},
            proposal_summary = ${resolution.proposalSummary},
            execution_guard_snapshot = ${guard}::jsonb,
            execution_auth_epoch = ${resolution.authorizationEpoch}::bigint,
            execution_policy_revision = ${resolution.policyRevision},
            executing_at = ${transition.executingAt},
            status = 'executing',
            updated_by = ${scope.principalId}::uuid
        WHERE id = ${scope.executionId}::uuid
          AND tenant_id = ${scope.tenantId}::uuid
          AND principal_id = ${scope.principalId}::uuid
          AND plane = ${scope.plane}
          AND run_id = ${scope.runId}::uuid
          AND thread_id = ${scope.threadId}::uuid
          AND tool_call_id = ${scope.callId}
          AND input_hash = ${transition.executionGuardSnapshot.argumentHash}
          AND status = 'proposed'
          AND EXISTS (
            SELECT 1
            FROM event.atlas_run r
            WHERE r.tenant_id = ${scope.tenantId}::uuid
              AND r.conversation_id = ${scope.threadId}::uuid
              AND r.plane = ${scope.plane}
              AND r.id = ${scope.runId}::uuid
              AND r.principal_id = ${scope.principalId}::uuid
              AND r.status = 'started'
          )
        RETURNING id
      `.execute(trx);
      exactlyOne(result.rows, "TRANSITION_CONFLICT");
    });
  }

  async finalize(terminal: AtlasToolExecutionTerminal): Promise<void> {
    const scope = validateScope(terminal.scope);
    const resolution = serializeAuthorization(terminal.resolution);
    const terminalRecord = serializeTerminal(terminal);
    const shouldResolve =
      resolution.autonomyDecision !== "not_evaluated";

    await this.withScope(scope, async (trx) => {
      const resolutionWrite = shouldResolve
        ? sql`
            tool_version = ${resolution.toolVersion},
            action_code = ${resolution.actionCode},
            operation_class = ${resolution.operationClass},
            risk_class = ${resolution.riskClass},
            autonomy_decision = ${resolution.autonomyDecision},
            permission_snapshot = ${resolution.permissionSnapshot}::jsonb,
            policy_snapshot = ${resolution.policySnapshot}::jsonb,
            profile_snapshot = ${resolution.profileSnapshot}::jsonb,
            authorization_epoch = ${resolution.authorizationEpoch}::bigint,
            policy_revision = ${resolution.policyRevision},
            profile_revision = ${resolution.profileRevision},
            proposal_summary = ${resolution.proposalSummary},
          `
        : sql``;
      const sourceStatuses = terminal.outcome === "completed"
        ? sql`('executing')`
        : terminal.outcome === "denied"
          ? sql`('proposed')`
          : shouldResolve
            ? sql`('proposed', 'executing')`
            : sql`('proposed')`;
      const result = await sql<MutationRow>`
        UPDATE event.ai_tool_invocation
        SET ${resolutionWrite}
            status = ${terminalRecord.status},
            terminal_error_class = ${terminalRecord.errorCode},
            result_hash = ${terminalRecord.resultHash},
            evidence_refs = ${terminalRecord.evidenceRefs}::jsonb,
            terminal_at = ${terminal.completedAt},
            duration_ms = ${terminal.durationMs}::bigint,
            updated_by = ${scope.principalId}::uuid
        WHERE id = ${scope.executionId}::uuid
          AND tenant_id = ${scope.tenantId}::uuid
          AND principal_id = ${scope.principalId}::uuid
          AND plane = ${scope.plane}
          AND run_id = ${scope.runId}::uuid
          AND thread_id = ${scope.threadId}::uuid
          AND tool_call_id = ${scope.callId}
          AND status IN ${sourceStatuses}
        RETURNING id
      `.execute(trx);
      exactlyOne(result.rows, "TRANSITION_CONFLICT");
    });
  }

  private async withScope<T>(
    scope: Pick<
      AtlasToolExecutionScope,
      "tenantId" | "principalId" | "plane"
    >,
    work: (trx: AnyDb) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.transaction().execute(async (transaction) => {
        const trx = transaction as unknown as AnyDb;
        await sql`
          SELECT
            set_config('app.current_tenant_id', ${scope.tenantId}, true),
            set_config('app.current_principal_id', ${scope.principalId}, true),
            set_config('app.current_atlas_plane', ${scope.plane}, true),
            set_config(
              'statement_timeout',
              ${String(this.statementTimeoutMs)},
              true
            )
        `.execute(trx);
        return work(trx);
      });
    } catch (error) {
      if (error instanceof SqlAtlasToolExecutionRecorderError) throw error;
      throw new SqlAtlasToolExecutionRecorderError("DATABASE_ERROR");
    }
  }
}

function serializeProposal(
  proposal: AtlasToolExecutionProposal,
): SerializedAuthorization {
  if (proposal.schemaVersion !== ATLAS_TOOL_EXECUTION_RECORD_SCHEMA_VERSION) {
    invalid();
  }
  validateScope(proposal);
  validToolName(proposal.toolName);
  validHash(proposal.argumentHash, true);
  validDate(proposal.proposedAt);
  const resolution = serializeAuthorization(proposal);
  if (
    proposal.authorizationProfileHash
      !== proposal.permissionSnapshot.profileHash
    || proposal.authorizationProfileHash
      !== proposal.profileSnapshot.profileHash
    || proposal.profileSnapshot.plane !== proposal.plane
  ) {
    invalid();
  }
  return resolution;
}

function serializeAuthorization(
  resolution: AtlasToolAuthorizationResolution,
): SerializedAuthorization {
  const toolVersion = optionalPattern(resolution.toolVersion, VERSION_RE, 64);
  const actionCode = optionalPattern(resolution.actionCode, ACTION_RE, 128);
  if (
    resolution.operationClass !== "read"
    && resolution.operationClass !== "unresolved"
  ) {
    invalid();
  }
  if (!RISKS.has(resolution.riskClass)) invalid();
  if (!AUTONOMY.has(resolution.autonomyDecision)) invalid();
  const authorizationEpoch = validInteger(resolution.authorizationEpoch);
  const policyRevision = safeText(resolution.policyRevision, 256);
  const profileRevision = safeText(resolution.profileRevision, 256);

  const permission = resolution.permissionSnapshot;
  if (
    permission.resolution !== "resolved"
    && permission.resolution !== "not_evaluated"
  ) {
    invalid();
  }
  if (
    permission.granted !== null
    && typeof permission.granted !== "boolean"
  ) {
    invalid();
  }
  const requiredPermissions = safeStringArray(
    permission.requiredPermissions,
    MAX_PERMISSIONS,
    128,
  );
  const permissionProfileHash = safeText(permission.profileHash, 256);

  const policy = resolution.policySnapshot;
  if (
    policy.resolution !== "resolved"
    && policy.resolution !== "not_evaluated"
  ) {
    invalid();
  }
  if (
    !["disabled", "suggest", "assist", "auto"].includes(
      policy.autonomyLevel,
    )
    || typeof policy.requiresHumanConfirmation !== "boolean"
    || (
      policy.confidenceThreshold !== null
      && (
        typeof policy.confidenceThreshold !== "number"
        || !Number.isFinite(policy.confidenceThreshold)
        || policy.confidenceThreshold < 0
        || policy.confidenceThreshold > 1
      )
    )
    || (
      policy.riskCeiling !== null
      && !["low", "medium", "high"].includes(policy.riskCeiling)
    )
  ) {
    invalid();
  }

  const profile = resolution.profileSnapshot;
  if (!PLANES.has(profile.plane)) invalid();
  const profileHash = safeText(profile.profileHash, 256);
  const schemaHash = safeText(profile.schemaHash, 256);

  const summary = resolution.proposalSummary;
  if (
    !RUNTIME_DISPOSITIONS.has(summary.runtimeDisposition)
    || !GATES.has(summary.gate)
    || typeof summary.handlerEligible !== "boolean"
  ) {
    invalid();
  }

  return {
    toolVersion,
    actionCode,
    operationClass: resolution.operationClass,
    riskClass: resolution.riskClass,
    autonomyDecision: resolution.autonomyDecision,
    permissionSnapshot: boundedJson({
      resolution: permission.resolution,
      requiredPermissions,
      granted: permission.granted,
      profileHash: permissionProfileHash,
    }, AUTHORIZATION_JSON_LIMIT),
    policySnapshot: boundedJson({
      resolution: policy.resolution,
      autonomyLevel: policy.autonomyLevel,
      requiresHumanConfirmation: policy.requiresHumanConfirmation,
      confidenceThreshold: policy.confidenceThreshold,
      riskCeiling: policy.riskCeiling,
    }, AUTHORIZATION_JSON_LIMIT),
    profileSnapshot: boundedJson({
      profileHash,
      schemaHash,
      plane: profile.plane,
    }, AUTHORIZATION_JSON_LIMIT),
    authorizationEpoch,
    policyRevision,
    profileRevision,
    proposalSummary: boundedJson({
      runtimeDisposition: summary.runtimeDisposition,
      gate: summary.gate,
      handlerEligible: summary.handlerEligible,
    }, SUMMARY_LIMIT),
  };
}

function serializeExecutionGuard(
  transition: AtlasToolExecutingTransition,
): string {
  const guard = transition.executionGuardSnapshot;
  if (
    guard.manifestSchemaVersion !== ATLAS_TOOL_MANIFEST_SCHEMA_VERSION
    || guard.access !== "read_only"
    || !["low", "medium", "high"].includes(guard.risk)
  ) {
    invalid();
  }
  const toolVersion = pattern(guard.toolVersion, VERSION_RE, 64);
  const actionCode = pattern(guard.actionCode, ACTION_RE, 128);
  const argumentHash = validHash(guard.argumentHash, false);
  if (
    toolVersion !== transition.resolution.toolVersion
    || actionCode !== transition.resolution.actionCode
    || guard.risk !== transition.resolution.riskClass
  ) {
    invalid();
  }

  const idempotency = guard.idempotency.mode === "required"
    ? {
        mode: "required",
        key: guard.idempotency.key,
        conflict: guard.idempotency.conflict,
      }
    : guard.idempotency.mode === "none"
      ? { mode: "none" }
      : invalid();
  const confirmation = guard.confirmation.mode === "human"
    ? {
        mode: "human",
        timing: guard.confirmation.timing,
      }
    : guard.confirmation.mode === "none"
      ? { mode: "none" }
      : invalid();
  const stepUp = guard.stepUp.mode === "required"
    ? {
        mode: "required",
        assuranceLevel: safeText(guard.stepUp.assuranceLevel, 128),
      }
    : guard.stepUp.mode === "none"
      ? { mode: "none" }
      : invalid();
  const dualControl = guard.dualControl.mode === "required"
    ? {
        mode: "required",
        approvals: guard.dualControl.approvals,
      }
    : guard.dualControl.mode === "none"
      ? { mode: "none" }
      : invalid();

  if (
    guard.implementation.kind !== "code"
    || guard.audit.lifecycle !== "proposed_executing_terminal"
    || guard.audit.arguments !== "sha256"
    || guard.audit.results !== "sha256"
    || guard.audit.contentStorage !== "forbidden"
    || !["code_source", "code_and_atlas_gateway"].includes(
      guard.evidence.mode,
    )
    || guard.evidence.requireVersion !== true
    || guard.evidence.requireChecksumForCode !== true
  ) {
    invalid();
  }

  return boundedJson({
    manifestSchemaVersion: guard.manifestSchemaVersion,
    toolVersion,
    actionCode,
    access: guard.access,
    risk: guard.risk,
    featureKey: safeText(guard.featureKey, 128),
    requiredPermissions: safeStringArray(
      guard.requiredPermissions,
      MAX_PERMISSIONS,
      128,
    ),
    idempotency,
    confirmation,
    stepUp,
    dualControl,
    implementation: {
      kind: "code",
      binding: safeText(guard.implementation.binding, 256),
    },
    audit: {
      lifecycle: guard.audit.lifecycle,
      arguments: guard.audit.arguments,
      results: guard.audit.results,
      contentStorage: guard.audit.contentStorage,
    },
    evidence: {
      mode: guard.evidence.mode,
      requireVersion: guard.evidence.requireVersion,
      requireChecksumForCode: guard.evidence.requireChecksumForCode,
    },
    argumentHash,
  }, AUTHORIZATION_JSON_LIMIT);
}

function serializeTerminal(terminal: AtlasToolExecutionTerminal): {
  status: "completed" | "denied" | "failed" | "cancelled";
  errorCode: AtlasToolExecutionErrorCode | null;
  resultHash: AtlasSha256Hex | null;
  evidenceRefs: string;
} {
  validDate(terminal.completedAt);
  validInteger(terminal.durationMs);
  if (
    terminal.outcome !== "completed"
    && terminal.outcome !== "denied"
    && terminal.outcome !== "failed"
    && terminal.outcome !== "cancelled"
  ) {
    invalid();
  }
  if (terminal.outcome === "completed") {
    if (
      terminal.errorCode !== null
      || validHash(terminal.resultHash, false) === null
    ) {
      invalid();
    }
    assertExecutableResolution(serializeAuthorization(terminal.resolution));
  } else if (
    terminal.resultHash !== null
    || terminal.errorCode === null
    || !ERROR_CODES.has(terminal.errorCode)
  ) {
    invalid();
  }
  if (
    terminal.outcome === "denied"
    && terminal.resolution.autonomyDecision !== "denied"
  ) {
    invalid();
  }

  return {
    status: terminal.outcome,
    errorCode: terminal.errorCode,
    resultHash: terminal.resultHash,
    evidenceRefs: terminal.outcome === "completed"
      ? serializeEvidence(
          terminal.evidence,
          terminal.resolution.profileSnapshot.profileHash,
        )
      : "[]",
  };
}

function serializeEvidence(
  evidence: readonly AtlasToolEvidenceMetadata[],
  expectedProfileHash: string,
): string {
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_REFS) {
    invalid();
  }
  const refs = evidence.map((entry) => {
    if (
      entry.schemaVersion !== ATLAS_TOOL_EVIDENCE_SCHEMA_VERSION
      || !["code", "record", "attachment", "content"].includes(entry.kind)
    ) {
      invalid();
    }
    const sourceChecksum = entry.sourceChecksum === undefined
      ? undefined
      : safeText(entry.sourceChecksum, 256);
    const authorizationProfileHash =
      entry.authorizationProfileHash === undefined
        ? undefined
        : safeText(entry.authorizationProfileHash, 256);
    if (
      authorizationProfileHash !== undefined
      && authorizationProfileHash !== expectedProfileHash
    ) {
      invalid();
    }
    return {
      schemaVersion: entry.schemaVersion,
      kind: entry.kind,
      sourceId: safeText(entry.sourceId, 200),
      sourceVersionId: safeText(entry.sourceVersionId, 128),
      ...(sourceChecksum ? { sourceChecksum } : {}),
      ...(authorizationProfileHash ? { authorizationProfileHash } : {}),
    };
  });
  return boundedJson(refs, EVIDENCE_JSON_LIMIT);
}

function assertExecutableResolution(
  resolution: SerializedAuthorization,
): void {
  if (
    resolution.toolVersion === null
    || resolution.actionCode === null
    || resolution.operationClass !== "read"
    || resolution.riskClass === "unknown"
    || !["suggest", "assist", "auto"].includes(
      resolution.autonomyDecision,
    )
  ) {
    invalid();
  }
}

function validateScope<T extends Pick<
  AtlasToolExecutionScope,
  | "executionId"
  | "tenantId"
  | "principalId"
  | "plane"
  | "runId"
  | "threadId"
  | "callId"
>>(scope: T): T {
  for (const value of [
    scope.executionId,
    scope.tenantId,
    scope.principalId,
    scope.runId,
    scope.threadId,
  ]) {
    if (!UUID_RE.test(value)) invalid();
  }
  if (!PLANES.has(scope.plane)) invalid();
  safeText(scope.callId, 256);
  return scope;
}

function validToolName(value: string): string {
  return pattern(value, TOOL_RE, 64);
}

function validHash<T extends string | null>(
  value: T,
  nullable: boolean,
): T {
  if (value === null) {
    if (!nullable) invalid();
    return value;
  }
  if (!HASH_RE.test(value)) invalid();
  return value;
}

function optionalPattern(
  value: string | null,
  regex: RegExp,
  maximumBytes: number,
): string | null {
  return value === null ? null : pattern(value, regex, maximumBytes);
}

function pattern(
  value: string,
  regex: RegExp,
  maximumBytes: number,
): string {
  if (
    typeof value !== "string"
    || Buffer.byteLength(value, "utf8") > maximumBytes
    || !regex.test(value)
  ) {
    invalid();
  }
  return value;
}

function safeText(value: string, maximumBytes: number): string {
  if (
    typeof value !== "string"
    || value.trim().length === 0
    || Buffer.byteLength(value, "utf8") > maximumBytes
    || !SAFE_TEXT_RE.test(value)
  ) {
    invalid();
  }
  return value;
}

function safeStringArray(
  value: readonly string[],
  maximumItems: number,
  maximumItemBytes: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length > maximumItems) invalid();
  return value.map((item) => safeText(item, maximumItemBytes));
}

function validInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) invalid();
  return value;
}

function validStatementTimeout(value: number): number {
  if (!Number.isSafeInteger(value) || value < 100 || value > 30_000) {
    throw new SqlAtlasToolExecutionRecorderError("INVALID_RECORD");
  }
  return value;
}

function validDate(value: Date): Date {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) invalid();
  return value;
}

function boundedJson(value: unknown, maximumBytes: number): string {
  const serialized = JSON.stringify(value);
  if (
    typeof serialized !== "string"
    || Buffer.byteLength(serialized, "utf8") > maximumBytes
  ) {
    invalid();
  }
  return serialized;
}

function exactlyOne(
  rows: readonly unknown[],
  code: Extract<RecorderErrorCode, "TRANSITION_CONFLICT">,
): void {
  if (rows.length !== 1) {
    throw new SqlAtlasToolExecutionRecorderError(code);
  }
}

function invalid(): never {
  throw new SqlAtlasToolExecutionRecorderError("INVALID_RECORD");
}

function messageFor(code: RecorderErrorCode): string {
  switch (code) {
    case "INVALID_RECORD":
      return "The Atlas tool audit record is invalid.";
    case "PROPOSAL_CONFLICT":
      return "The Atlas tool proposal conflicts with an existing invocation.";
    case "TRANSITION_CONFLICT":
      return "The Atlas tool invocation transition was not applied.";
    case "DATABASE_ERROR":
      return "The Atlas tool audit record could not be persisted.";
  }
}
