import type {
  AtlasToolProposal,
  AtlasToolProposalStore,
  AtlasToolStoreResult,
  AtlasToolTerminalFailureInput,
} from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import { sql, type Kysely, type Transaction } from "kysely";

type Database = Record<string, never>;
type Tx = Transaction<Database>;
type Row = Record<string, unknown>;

export interface KyselyAtlasToolProposalStoreOptions {
  readonly transactions: PlaneTransactionCoordinator<Tx>;
  readonly databases?: Readonly<Partial<Record<VerifiedRequestContext["planeKey"], Kysely<Database>>>>;
}

/** RLS-aware, compare-and-swap implementation of the durable Atlas invocation ledger. */
export class KyselyAtlasToolProposalStore implements AtlasToolProposalStore {
  constructor(private readonly options: KyselyAtlasToolProposalStoreOptions) {}

  propose(input: { readonly context: VerifiedRequestContext; readonly proposal: AtlasToolProposal }): Promise<AtlasToolStoreResult> {
    return this.withTransaction(input.context, async (transaction) => {
      const p = input.proposal;
      const inserted = await sql<Row>`
        INSERT INTO ai.ai_tool_invocation (
          id, tenant_id, thread_id, run_id, plane, principal_id, tool_call_id, tool_code,
          tool_version, action_code, input_hash, operation_class, risk_class, autonomy_decision,
          permission_snapshot, policy_snapshot, profile_snapshot, authorization_epoch,
          policy_revision, profile_revision, proposal_summary, expected_record_row_version,
          affected_entity_type, affected_entity_id,
          confirmation_required, confirmation_policy, confirmation_token_hash,
          confirmation_expires_at, status, created_at, created_by
        ) VALUES (
          ${p.proposalId}::uuid, ${p.tenantId}::uuid, ${p.threadId}::uuid, ${p.runId}::uuid,
          ${p.planeKey}, ${p.principalId}::uuid, ${p.callId}, ${p.toolCode}, ${p.toolVersion},
          ${p.actionCode}, ${p.argumentHash}, ${p.operationClass}, ${p.risk}, ${p.autonomyDecision},
          ${json(p.permissionSnapshot)}::jsonb, ${json(p.policySnapshot)}::jsonb,
          ${json(p.profileSnapshot)}::jsonb, ${p.authorizationEpoch}, ${p.policyRevision},
          ${p.profileRevision}, ${p.summary}, ${p.expectedRowVersion ?? null},
          ${p.affectedEntityType ?? null}, ${p.affectedEntityId ?? null}::uuid,
          ${p.confirmationRequired}, ${p.confirmationRequired ? "explicit" : "none"},
          ${p.confirmationTokenHash ?? null}, ${p.expiresAt ?? null}::timestamptz,
          'proposed', ${p.createdAt}::timestamptz, ${p.principalId}::uuid
        )
        ON CONFLICT (tenant_id, run_id, tool_call_id) DO NOTHING
        RETURNING *
      `.execute(transaction);
      if (inserted.rows[0]) return { kind: "created", proposal: rowToProposal(inserted.rows[0]) };
      const existing = await this.byCall(p.tenantId, p.runId, p.callId, transaction);
      if (existing && sameInvocation(existing, p)) return { kind: "replayed", proposal: existing };
      return { kind: "conflict", proposal: existing };
    });
  }

  get(input: { readonly context: VerifiedRequestContext; readonly proposalId: string }): Promise<AtlasToolProposal | null> {
    return this.withTransaction(input.context, (transaction) => this.byId(input.context.tenantId, input.proposalId, transaction));
  }

  list(input: { readonly context: VerifiedRequestContext; readonly limit: number }): Promise<readonly AtlasToolProposal[]> {
    const limit = Math.min(Math.max(Math.trunc(input.limit), 1), 100);
    return this.withTransaction(input.context, async (transaction) => {
      const result = await sql<Row>`SELECT * FROM ai.ai_tool_invocation WHERE tenant_id=${input.context.tenantId}::uuid AND principal_id=${input.context.principalId}::uuid ORDER BY created_at DESC, id DESC LIMIT ${limit}`.execute(transaction);
      return Object.freeze(result.rows.map(rowToProposal));
    });
  }

  confirm(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly tokenHash: string; readonly confirmedAt: string }): Promise<AtlasToolStoreResult> {
    return this.transition(input.context, input.proposalId, sql<Row>`
      UPDATE ai.ai_tool_invocation SET status='confirmed', confirmation_actor_id=${input.context.principalId}::uuid,
        confirmation_at=${input.confirmedAt}::timestamptz, updated_at=${input.confirmedAt}::timestamptz,
        updated_by=${input.context.principalId}::uuid
      WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.proposalId}::uuid
        AND status='proposed' AND confirmation_required=true
        AND confirmation_token_hash=${input.tokenHash}
        AND confirmation_expires_at > ${input.confirmedAt}::timestamptz
      RETURNING *
    `, ["confirmed"]);
  }

  beginExecution(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly expectedStatus: "proposed" | "confirmed"; readonly executionGuard: Readonly<Record<string, unknown>>; readonly authorizationEpoch: number; readonly policyRevision: string; readonly downstreamIdempotencyKey?: string; readonly executingAt: string }): Promise<AtlasToolStoreResult> {
    return this.transition(input.context, input.proposalId, sql<Row>`
      UPDATE ai.ai_tool_invocation SET status='executing', execution_guard_snapshot=${json(input.executionGuard)}::jsonb,
        execution_auth_epoch=${input.authorizationEpoch}, execution_policy_revision=${input.policyRevision},
        downstream_command_idempotency_key=${input.downstreamIdempotencyKey ?? null},
        executing_at=${input.executingAt}::timestamptz, updated_at=${input.executingAt}::timestamptz,
        updated_by=${input.context.principalId}::uuid
      WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.proposalId}::uuid
        AND status=${input.expectedStatus}
      RETURNING *
    `, ["executing", "completed"]);
  }

  complete(input: { readonly context: VerifiedRequestContext; readonly proposalId: string; readonly resultHash: string; readonly evidenceRefs?: readonly Readonly<Record<string, unknown>>[]; readonly businessTransactionId?: string; readonly businessTransactionType?: string; readonly terminalAt: string; readonly durationMs: number }): Promise<AtlasToolStoreResult> {
    return this.transition(input.context, input.proposalId, sql<Row>`
      UPDATE ai.ai_tool_invocation SET status='completed', result_hash=${input.resultHash},
        evidence_refs=${json(input.evidenceRefs ?? [])}::jsonb,
        business_transaction_id=${input.businessTransactionId ?? null}::uuid,
        business_transaction_type=${input.businessTransactionType ?? null}, terminal_at=${input.terminalAt}::timestamptz,
        duration_ms=${input.durationMs}, updated_at=${input.terminalAt}::timestamptz,
        updated_by=${input.context.principalId}::uuid
      WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.proposalId}::uuid AND status='executing'
      RETURNING *
    `, ["completed"]);
  }

  fail(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return this.failure("failed", input); }
  deny(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return this.failure("denied", input); }
  expire(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return this.failure("expired", input); }
  cancel(input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> { return this.failure("cancelled", input); }

  async health(): Promise<{ readonly healthy: boolean; readonly message?: string }> {
    const entries = Object.entries(this.options.databases ?? {});
    if (!entries.length) return { healthy: false, message: "No Atlas plane database is configured." };
    try {
      for (const [, database] of entries) await sql`SELECT 1 FROM ai.ai_tool_invocation LIMIT 0`.execute(database!);
      return { healthy: true };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : "Atlas invocation ledger is unavailable." };
    }
  }

  private failure(status: "failed" | "denied" | "expired" | "cancelled", input: AtlasToolTerminalFailureInput): Promise<AtlasToolStoreResult> {
    return this.withTransaction(input.context, async (transaction) => {
      const updated = await sql<Row>`
        UPDATE ai.ai_tool_invocation SET status=${status}, terminal_error_class=${bounded(input.errorClass, 128)},
          terminal_at=${input.terminalAt}::timestamptz, duration_ms=${input.durationMs},
          updated_at=${input.terminalAt}::timestamptz, updated_by=${input.context.principalId}::uuid
        WHERE tenant_id=${input.context.tenantId}::uuid AND id=${input.proposalId}::uuid
          AND status = ANY(${sql`ARRAY[${sql.join(input.expectedStatuses.map((value) => sql`${value}`))}]::text[]`})
        RETURNING *
      `.execute(transaction);
      if (updated.rows[0]) return { kind: "transitioned", proposal: rowToProposal(updated.rows[0]) };
      const current = await this.byId(input.context.tenantId, input.proposalId, transaction);
      return current && current.status === status ? { kind: "replayed", proposal: current } : { kind: "conflict", proposal: current };
    });
  }

  private transition(context: VerifiedRequestContext, proposalId: string, query: ReturnType<typeof sql<Row>>, replayStatuses: readonly string[]): Promise<AtlasToolStoreResult> {
    return this.withTransaction(context, async (transaction) => {
      const updated = await query.execute(transaction);
      if (updated.rows[0]) return { kind: "transitioned", proposal: rowToProposal(updated.rows[0]) };
      const current = await this.byId(context.tenantId, proposalId, transaction);
      return current && replayStatuses.includes(current.status) ? { kind: "replayed", proposal: current } : { kind: "conflict", proposal: current };
    });
  }

  private withTransaction<T>(context: VerifiedRequestContext, work: (transaction: Tx) => Promise<T>): Promise<T> {
    return this.options.transactions.run(context.planeKey, { tenantId: context.tenantId, principalId: context.principalId }, async (transaction) => {
      await sql`SELECT set_config('app.current_atlas_plane', ${context.planeKey}, true)`.execute(transaction);
      return work(transaction);
    });
  }
  private async byId(tenantId: string, proposalId: string, transaction: Tx): Promise<AtlasToolProposal | null> {
    const result = await sql<Row>`SELECT * FROM ai.ai_tool_invocation WHERE tenant_id=${tenantId}::uuid AND id=${proposalId}::uuid LIMIT 1`.execute(transaction);
    return result.rows[0] ? rowToProposal(result.rows[0]) : null;
  }
  private async byCall(tenantId: string, runId: string, callId: string, transaction: Tx): Promise<AtlasToolProposal | null> {
    const result = await sql<Row>`SELECT * FROM ai.ai_tool_invocation WHERE tenant_id=${tenantId}::uuid AND run_id=${runId}::uuid AND tool_call_id=${callId} LIMIT 1`.execute(transaction);
    return result.rows[0] ? rowToProposal(result.rows[0]) : null;
  }
}

function rowToProposal(row: Row): AtlasToolProposal {
  const requiredConfirmation = Boolean(row["confirmation_required"]);
  return {
    proposalId: String(row["id"]), tenantId: String(row["tenant_id"]), threadId: String(row["thread_id"]), runId: String(row["run_id"]),
    planeKey: String(row["plane"]) as AtlasToolProposal["planeKey"], principalId: String(row["principal_id"]), callId: String(row["tool_call_id"]),
    toolCode: String(row["tool_code"]), toolVersion: String(row["tool_version"]), actionCode: String(row["action_code"]),
    argumentHash: String(row["input_hash"]), operationClass: String(row["operation_class"]) as AtlasToolProposal["operationClass"],
    access: row["operation_class"] === "mutate" ? "mutation" : "read", risk: String(row["risk_class"]) as AtlasToolProposal["risk"],
    autonomyDecision: String(row["autonomy_decision"]) as AtlasToolProposal["autonomyDecision"], permissionSnapshot: object(row["permission_snapshot"]),
    policySnapshot: object(row["policy_snapshot"]), profileSnapshot: object(row["profile_snapshot"]), authorizationEpoch: Number(row["authorization_epoch"]),
    policyRevision: String(row["policy_revision"]), profileRevision: String(row["profile_revision"]), authorizationProfileHash: String(object(row["profile_snapshot"])["profileHash"] ?? row["profile_revision"]),
    summary: String(row["proposal_summary"]), ...(row["expected_record_row_version"] == null ? {} : { expectedRowVersion: Number(row["expected_record_row_version"]) }),
    ...(row["affected_entity_type"] ? { affectedEntityType: String(row["affected_entity_type"]) } : {}),
    ...(row["affected_entity_id"] ? { affectedEntityId: String(row["affected_entity_id"]) } : {}),
    confirmationRequired: requiredConfirmation, ...(row["confirmation_token_hash"] ? { confirmationTokenHash: String(row["confirmation_token_hash"]) } : {}),
    ...(row["confirmation_expires_at"] ? { expiresAt: iso(row["confirmation_expires_at"]) } : {}), status: String(row["status"]) as AtlasToolProposal["status"],
    createdAt: iso(row["created_at"]), ...(row["confirmation_at"] ? { confirmationAt: iso(row["confirmation_at"]) } : {}),
    ...(row["executing_at"] ? { executingAt: iso(row["executing_at"]) } : {}), ...(row["terminal_at"] ? { terminalAt: iso(row["terminal_at"]) } : {}),
    ...(row["duration_ms"] == null ? {} : { durationMs: Number(row["duration_ms"]) }), ...(row["execution_auth_epoch"] == null ? {} : { executionAuthEpoch: Number(row["execution_auth_epoch"]) }),
    ...(row["execution_policy_revision"] ? { executionPolicyRevision: String(row["execution_policy_revision"]) } : {}),
    ...(row["downstream_command_idempotency_key"] ? { downstreamIdempotencyKey: String(row["downstream_command_idempotency_key"]) } : {}),
    ...(row["terminal_error_class"] ? { terminalErrorClass: String(row["terminal_error_class"]) } : {}), ...(row["result_hash"] ? { resultHash: String(row["result_hash"]) } : {}),
    ...(row["business_transaction_id"] ? { businessTransactionId: String(row["business_transaction_id"]) } : {}),
    ...(row["business_transaction_type"] ? { businessTransactionType: String(row["business_transaction_type"]) } : {}), evidenceRefs: array(row["evidence_refs"]),
  };
}
function sameInvocation(a: AtlasToolProposal, b: AtlasToolProposal): boolean {
  const comparable = (value: AtlasToolProposal) => ({
    tenantId: value.tenantId, planeKey: value.planeKey, principalId: value.principalId,
    threadId: value.threadId, runId: value.runId, callId: value.callId,
    toolCode: value.toolCode, toolVersion: value.toolVersion, actionCode: value.actionCode,
    argumentHash: value.argumentHash, summary: value.summary, access: value.access,
    operationClass: value.operationClass, risk: value.risk, autonomyDecision: value.autonomyDecision,
    affectedEntityType: value.affectedEntityType ?? null, affectedEntityId: value.affectedEntityId ?? null,
    expectedRowVersion: value.expectedRowVersion ?? null, policyRevision: value.policyRevision,
    profileRevision: value.profileRevision, authorizationProfileHash: value.authorizationProfileHash,
    authorizationEpoch: value.authorizationEpoch, permissionSnapshot: value.permissionSnapshot,
    policySnapshot: value.policySnapshot, profileSnapshot: value.profileSnapshot,
    confirmationRequired: value.confirmationRequired,
  });
  return canonical(comparable(a)) === canonical(comparable(b));
}
function json(value: unknown): string { return JSON.stringify(value); }
function canonical(value: unknown): string { if (value === null || typeof value !== "object") return JSON.stringify(value); if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`; }
function object(value: unknown): Readonly<Record<string, unknown>> { return (typeof value === "string" ? JSON.parse(value) : value) as Readonly<Record<string, unknown>>; }
function array(value: unknown): readonly Readonly<Record<string, unknown>>[] { return (typeof value === "string" ? JSON.parse(value) : value ?? []) as readonly Readonly<Record<string, unknown>>[]; }
function iso(value: unknown): string { return new Date(String(value)).toISOString(); }
function bounded(value: string, max: number): string { const result = value.trim(); if (!result || Buffer.byteLength(result, "utf8") > max) throw new TypeError("Atlas terminal error class is invalid."); return result; }
