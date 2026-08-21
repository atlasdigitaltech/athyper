import { sql, type Transaction } from "kysely";
import type {
  IdentityProvisioningAttemptRepository,
  ProvisioningAttemptReceipt,
  ProvisioningAttemptResult,
} from "./identity-provisioning-service.js";

type Database = Record<string, never>;
export type IdentityProvisioningAttemptTransaction = Transaction<Database>;
type Row = Record<string, unknown>;

export class KyselyIdentityProvisioningAttemptRepository implements IdentityProvisioningAttemptRepository<IdentityProvisioningAttemptTransaction> {
  async claim(
    input: Parameters<IdentityProvisioningAttemptRepository<IdentityProvisioningAttemptTransaction>["claim"]>[0],
    tx: IdentityProvisioningAttemptTransaction,
  ): Promise<ProvisioningAttemptResult> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.requestId}`},0))`.execute(tx);
    const request = (await sql<Row>`SELECT status FROM trustiam.identity_provisioning_request WHERE authority_tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid FOR UPDATE`.execute(tx)).rows[0];
    if (!request) return { kind: "conflict", reason: "invalid_state" };

    const latest = (await sql<Row>`SELECT * FROM trustiam.identity_provisioning_attempt WHERE authority_tenant_id=${input.tenantId}::uuid AND request_id=${input.requestId}::uuid ORDER BY attempt_no DESC LIMIT 1 FOR UPDATE`.execute(tx)).rows[0];
    if (latest && ["claimed", "started"].includes(String(latest["status"]))) {
      return String(latest["worker_id"]) === input.workerId && String(latest["claim_token_hash"]) === input.claimTokenHash
        ? { kind: "replayed", receipt: map(latest, true) }
        : { kind: "conflict", reason: "already_claimed" };
    }
    if (latest?.["status"] === "applied") return { kind: "conflict", reason: "already_applied" };

    const requestStatus = String(request["status"]);
    if (input.retryOnly) {
      if (latest?.["status"] !== "failed" || requestStatus !== "failed") return { kind: "conflict", reason: "invalid_state" };
    } else if (latest || requestStatus !== "requested") {
      return { kind: "conflict", reason: "invalid_state" };
    }

    const attemptNo = latest ? Number(latest["attempt_no"]) + 1 : 1;
    const inserted = await sql<Row>`INSERT INTO trustiam.identity_provisioning_attempt(id,authority_tenant_id,request_id,attempt_no,worker_id,claim_token_hash,status,lease_expires_at,created_at,created_by) VALUES(${input.attemptId}::uuid,${input.tenantId}::uuid,${input.requestId}::uuid,${attemptNo},${input.workerId},${input.claimTokenHash},'claimed',${input.leaseExpiresAt}::timestamptz,${input.claimedAt}::timestamptz,current_setting('app.current_principal_id')::uuid) RETURNING *`.execute(tx);
    return { kind: "transitioned", receipt: map(inserted.rows[0]!, false) };
  }

  async transition(
    input: Parameters<IdentityProvisioningAttemptRepository<IdentityProvisioningAttemptTransaction>["transition"]>[0],
    tx: IdentityProvisioningAttemptTransaction,
  ): Promise<ProvisioningAttemptResult> {
    const terminal = input.to !== "started";
    const error = input.to === "failed" || input.to === "cancelled" ? (input.errorCode ?? input.to) : null;
    const updated = await sql<Row>`UPDATE trustiam.identity_provisioning_attempt SET status=${input.to},started_at=CASE WHEN ${input.to}='started' THEN ${input.occurredAt}::timestamptz ELSE started_at END,terminal_at=CASE WHEN ${terminal} THEN ${input.occurredAt}::timestamptz ELSE NULL END,error_code=${error},receipt=${JSON.stringify(input.receipt)}::jsonb,row_version=row_version+1,updated_by=current_setting('app.current_principal_id')::uuid WHERE authority_tenant_id=${input.tenantId}::uuid AND request_id=${input.requestId}::uuid AND id=${input.attemptId}::uuid AND status=${input.expectedStatus} AND claim_token_hash=${input.claimTokenHash} AND row_version=${input.expectedVersion} AND lease_expires_at>${input.occurredAt}::timestamptz RETURNING *`.execute(tx);
    if (!updated.rows[0]) {
      const current = (await sql<Row>`SELECT * FROM trustiam.identity_provisioning_attempt WHERE authority_tenant_id=${input.tenantId}::uuid AND id=${input.attemptId}::uuid LIMIT 1`.execute(tx)).rows[0];
      const isAuthenticatedReplay = current?.["status"] === input.to
        && current["request_id"] === input.requestId
        && current["claim_token_hash"] === input.claimTokenHash;
      if (isAuthenticatedReplay) return { kind: "replayed", receipt: map(current!, true) };
      return { kind: "conflict", reason: current && Number(current["row_version"]) !== input.expectedVersion ? "stale_version" : "invalid_state" };
    }

    const requestStatus = input.to === "started" ? "provisioning" : input.to === "applied" ? "active" : input.to === "failed" ? "failed" : "deprovisioned";
    await sql`UPDATE trustiam.identity_provisioning_request SET status=${requestStatus},provider_subject=CASE WHEN ${input.to}='applied' THEN ${input.providerSubject ?? null} ELSE provider_subject END,failure_reason=CASE WHEN ${input.to}='failed' THEN ${error} ELSE NULL END,row_version=row_version+1,updated_by=current_setting('app.current_principal_id')::uuid WHERE authority_tenant_id=${input.tenantId}::uuid AND id=${input.requestId}::uuid`.execute(tx);
    return { kind: "transitioned", receipt: map(updated.rows[0], false) };
  }
}

function map(row: Row, replayed: boolean): ProvisioningAttemptReceipt {
  return {
    attemptId: String(row["id"]), requestId: String(row["request_id"]), attemptNo: Number(row["attempt_no"]),
    workerId: String(row["worker_id"]), status: String(row["status"]) as ProvisioningAttemptReceipt["status"],
    rowVersion: Number(row["row_version"]), leaseExpiresAt: iso(row["lease_expires_at"]),
    ...(row["started_at"] ? { startedAt: iso(row["started_at"]) } : {}),
    ...(row["terminal_at"] ? { terminalAt: iso(row["terminal_at"]) } : {}),
    ...(row["error_code"] ? { errorCode: String(row["error_code"]) } : {}),
    receipt: object(row["receipt"]), replayed,
  };
}
function iso(value: unknown) { return new Date(String(value)).toISOString(); }
function object(value: unknown) { return (typeof value === "string" ? JSON.parse(value) : value ?? {}) as Readonly<Record<string, unknown>>; }
