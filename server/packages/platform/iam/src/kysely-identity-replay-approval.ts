import { randomUUID } from "node:crypto";
import { sql, type Transaction } from "kysely";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  IdentityReplayError,
  type IdentityReplayApproval,
  type IdentityReplayApprovalRepository,
} from "./identity-replay-approval.js";

type Tx = Transaction<Record<string, never>>;
type Row = {
  id: string;
  authority_tenant_id: string;
  attempt_id: string;
  desired_version: string;
  desired_hash: string;
  requested_by: string;
  reason: string;
  status: IdentityReplayApproval["status"];
  expires_at: Date;
  approved_by: string | null;
};
const missing = () =>
  new IdentityReplayError(404, "IAM_REPLAY_APPROVAL_NOT_FOUND");
const conflict = () =>
  new IdentityReplayError(409, "IAM_REPLAY_APPROVAL_STALE");
export class KyselyIdentityReplayApprovalRepository implements IdentityReplayApprovalRepository {
  constructor(
    private readonly run: <T>(work: (tx: Tx) => Promise<T>) => Promise<T>,
    private readonly audit: AuditRecorder<Tx>,
  ) {}
  private async mutate<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    try {
      return await this.run(work);
    } catch (error) {
      // Expiry can pass the UPDATE predicate and elapse before a database guard
      // runs. Translate only those guard failures, after the transaction rolls back.
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "23514" &&
        (error.message === "invalid replay approval transition" ||
          error.message === "durable replay approval required")
      )
        throw conflict();
      throw error;
    }
  }
  private async record(
    tx: Tx,
    context: VerifiedRequestContext,
    row: Row,
    action: string,
    reason?: string,
  ) {
    await this.audit.record(
      {
        eventCode: `iam.identity_replay.${action}`,
        action,
        outcome: "success",
        actor: { kind: "user", principalId: context.principalId },
        tenantId: context.tenantId,
        entityType: "trustiam.identity_replay_approval",
        entityId: row.id,
        requestId: context.requestId,
        metadata: {
          attemptId: row.attempt_id,
          desiredVersion: String(row.desired_version),
          desiredHash: row.desired_hash,
          requestedBy: row.requested_by,
          approvedBy: row.approved_by,
          ...(reason ? { reason } : {}),
        },
      },
      tx,
    );
  }
  // Creation, approval and consumption lock projection -> attempt -> approval.
  // Revocation only locks the approval row. Workers lock the projection before
  // claiming, so a desired-state update/claim cannot race approval consumption.
  private async lockAttempt(tx: Tx, tenantId: string, attemptId: string) {
    const projection = (
      await sql<{
        id: string;
        desired_version: string;
        desired_hash: string;
      }>`SELECT * FROM trustiam.lock_identity_replay_projection(${tenantId}::uuid,${attemptId}::uuid)`.execute(
        tx,
      )
    ).rows[0];
    if (!projection) throw missing();
    const attempt = (
      await sql<{
        desired_version: string;
        desired_hash: string;
        status: string;
        replay_requested_at: Date | null;
      }>`SELECT desired_version,desired_hash,status,replay_requested_at FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenantId}::uuid AND id=${attemptId}::uuid FOR UPDATE`.execute(
        tx,
      )
    ).rows[0];
    const newer = (
      await sql`SELECT 1 FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenantId}::uuid AND identity_projection_id=${projection.id}::uuid AND attempt_no>(SELECT attempt_no FROM trustiam.identity_saga_attempt WHERE id=${attemptId}::uuid) LIMIT 1`.execute(
        tx,
      )
    ).rows.length;
    if (
      !attempt ||
      attempt.status !== "dead_letter" ||
      attempt.replay_requested_at ||
      newer ||
      String(projection.desired_version) !== String(attempt.desired_version) ||
      projection.desired_hash !== attempt.desired_hash
    )
      throw conflict();
    return attempt;
  }
  async create(
    context: VerifiedRequestContext,
    input: { attemptId: string; reason: string; ttlSeconds: number },
  ) {
    return this.mutate(async (tx) => {
      const attempt = await this.lockAttempt(
        tx,
        context.tenantId,
        input.attemptId,
      );
      const row = (
        await sql<Row>`INSERT INTO trustiam.identity_replay_approval(id,authority_tenant_id,attempt_id,desired_version,desired_hash,requested_by,reason,expires_at) VALUES(${randomUUID()}::uuid,${context.tenantId}::uuid,${input.attemptId}::uuid,${attempt.desired_version},${attempt.desired_hash},${context.principalId}::uuid,${input.reason},clock_timestamp()+${input.ttlSeconds}*interval '1 second') RETURNING *`.execute(
          tx,
        )
      ).rows[0]!;
      await this.record(tx, context, row, "requested", input.reason);
      return present(row);
    });
  }
  async read(context: VerifiedRequestContext, approvalId: string) {
    return this.run(async (tx) =>
      present(await this.find(tx, context.tenantId, approvalId)),
    );
  }
  private async find(
    tx: Tx,
    tenantId: string,
    approvalId: string,
  ): Promise<Row> {
    const row = (
      await sql<Row>`SELECT * FROM trustiam.identity_replay_approval WHERE authority_tenant_id=${tenantId}::uuid AND id=${approvalId}::uuid`.execute(
        tx,
      )
    ).rows[0];
    if (!row) throw missing();
    return row;
  }
  async decide(
    context: VerifiedRequestContext,
    input: {
      approvalId: string;
      decision: "approve" | "revoke";
      reason: string;
    },
  ) {
    return this.mutate(async (tx) => {
      const approval = await this.find(tx, context.tenantId, input.approvalId);
      // Revocation must remain available even after the desired state has changed.
      if (input.decision === "approve") {
        await this.lockAttempt(tx, context.tenantId, approval.attempt_id);
        if (approval.requested_by === context.principalId)
          throw new IdentityReplayError(403, "IAM_REPLAY_SOD_REQUIRED");
      }
      const row = (
        await (
          input.decision === "approve"
            ? sql<Row>`UPDATE trustiam.identity_replay_approval SET status='approved',approved_by=${context.principalId}::uuid,approved_at=clock_timestamp(),decision_reason=${input.reason} WHERE authority_tenant_id=${context.tenantId}::uuid AND id=${input.approvalId}::uuid AND status='pending' AND expires_at>clock_timestamp() RETURNING *`
            : sql<Row>`UPDATE trustiam.identity_replay_approval SET status='revoked',revoked_by=${context.principalId}::uuid,revoked_at=clock_timestamp(),revocation_reason=${input.reason} WHERE authority_tenant_id=${context.tenantId}::uuid AND id=${input.approvalId}::uuid AND status IN('pending','approved') RETURNING *`
        ).execute(tx)
      ).rows[0];
      if (!row) throw conflict();
      await this.record(
        tx,
        context,
        row,
        input.decision === "approve" ? "approved" : "revoked",
        input.reason,
      );
      return present(row);
    });
  }
  async consume(
    context: VerifiedRequestContext,
    input: { attemptId: string; approvalId: string },
  ) {
    return this.mutate(async (tx) => {
      const attempt = await this.lockAttempt(
        tx,
        context.tenantId,
        input.attemptId,
      );
      const row = (
        await sql<Row>`UPDATE trustiam.identity_replay_approval SET status='consumed',consumed_at=clock_timestamp() WHERE authority_tenant_id=${context.tenantId}::uuid AND id=${input.approvalId}::uuid AND attempt_id=${input.attemptId}::uuid AND desired_version=${attempt.desired_version} AND desired_hash=${attempt.desired_hash} AND requested_by=${context.principalId}::uuid AND approved_by<>${context.principalId}::uuid AND status='approved' AND expires_at>clock_timestamp() RETURNING *`.execute(
          tx,
        )
      ).rows[0];
      if (!row) throw conflict();
      const result =
        await sql`UPDATE trustiam.identity_saga_attempt SET replay_requested_at=clock_timestamp(),replay_requested_by=${row.requested_by}::uuid,replay_approved_by=${row.approved_by}::uuid,updated_by=${context.principalId}::uuid WHERE authority_tenant_id=${context.tenantId}::uuid AND id=${input.attemptId}::uuid AND status='dead_letter' AND replay_requested_at IS NULL`.execute(
          tx,
        );
      if (Number(result.numAffectedRows ?? 0) !== 1) throw conflict();
      await this.record(tx, context, row, "consumed");
    });
  }
}
function present(row: Row): IdentityReplayApproval {
  return {
    id: row.id,
    authorityTenantId: row.authority_tenant_id,
    attemptId: row.attempt_id,
    desiredVersion: String(row.desired_version),
    desiredHash: row.desired_hash,
    requestedBy: row.requested_by,
    reason: row.reason,
    status: row.status,
    expiresAt: new Date(row.expires_at).toISOString(),
    approvedBy: row.approved_by,
  };
}
