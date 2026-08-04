import { createHash } from "node:crypto";

import { CompiledQuery, type Kysely } from "kysely";

import { CANONICAL_AUTHORIZATION_CONTRACT_VERSION } from
  "../authorization-evaluator/index.js";
import type {
  AuthorizationDecisionAuditRecord,
  AuthorizationDecisionAuditSink,
} from "./types.js";

type AnyDb = Kysely<Record<string, never>>;

export class SqlAuthorizationDecisionAuditSink
  implements AuthorizationDecisionAuditSink {
  constructor(
    private readonly db: AnyDb,
    private readonly plane: "neon" | "admin" | "mesh",
    private readonly evaluatorRevision: string,
  ) {}

  async append(
    records: readonly AuthorizationDecisionAuditRecord[],
  ): Promise<void> {
    for (const record of records) {
      if (record.request.subject.plane !== this.plane) {
        throw new Error("audit sink rejects a cross-plane decision");
      }
      await this.appendOne(record);
    }
  }

  private async appendOne(
    record: AuthorizationDecisionAuditRecord,
  ): Promise<void> {
    const result = record.envelope.result;
    const evidence = result.evidence;
    const resource = record.request.mode === "entity_resource"
      ? record.request.resource
      : undefined;

    if (this.plane === "neon") {
      await this.appendCanonicalDecision(
        record,
        resource?.recordId ?? null,
        record.request.subject.tenantOrAccountId,
        null,
      );
      return;
    }
    if (this.plane === "mesh") {
      const accountId = record.request.subject.tenantOrAccountId;
      const account = await this.db.executeQuery<{ tenant_id: string }>(
        CompiledQuery.raw(`
          SELECT tenant_id::text
          FROM mesh.network_account
          WHERE id = $1::uuid AND status = 'active'
        `, [accountId]),
      );
      const tenantId = account.rows[0]?.tenant_id;
      if (!tenantId) {
        throw new Error("audit sink cannot resolve the active Mesh account tenant");
      }
      await this.appendCanonicalDecision(
        record,
        resource?.recordId ?? null,
        tenantId,
        accountId,
      );
      return;
    }

    const allowByKind = (kind: string) => evidence.matchingAllowProofs
      .filter((proof) => proof.kind === kind)
      .map((proof) => proof.proofId);
    const roleProofs = allowByKind("group_role");
    const epoch = await this.loadEpoch(
      record.request.subject.tenantOrAccountId,
    );
    // Neon and Mesh return through the canonical audit writer above. This
    // compatibility branch remains only for the Admin runtime until its
    // separate consumer certification is completed.
    const keyColumn = "tenant_id";
    const table = "log.auth_decision_evidence_v2";
    const middleEpochColumn = "tenant_epoch";
    const resourceKeySha256 = resource?.recordId
      ? sha256(resource.recordId)
      : null;
    const evidenceIds = {
      planeMembership: evidence.planeMembershipEvidenceId ?? null,
      entitlement: evidence.entitlementEvidenceId,
      denies: evidence.matchingDenyProofs,
      allows: evidence.matchingAllowProofs,
      catalogVersion: evidence.catalogVersion,
      policyVersion: evidence.policyVersion,
      authorizationFingerprint: record.envelope.authorizationFingerprint,
    };
    const parameters: readonly unknown[] = [
      record.request.subject.tenantOrAccountId,
      record.request.subject.plane,
      result.decision,
      result.reason,
      CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
      this.evaluatorRevision,
      record.request.subject.principalId,
      evidence.permissionId,
      record.request.mode === "registered_capability"
        ? null
        : record.request.entityOperationId,
      resource?.entityId ? "entity_record" : null,
      resourceKeySha256,
      epoch.global,
      epoch.boundary,
      epoch.plane,
      evidence.entitlementEvidenceId,
      sha256(evidence.catalogVersion),
      sha256(roleProofs.sort().join("|") || "no-role-compilation"),
      evidence.planeMembershipEvidenceId
        ? [evidence.planeMembershipEvidenceId]
        : [],
      evidence.matchingDenyIds,
      allowByKind("override"),
      allowByKind("record_acl"),
      allowByKind("delegation"),
      JSON.stringify(evidenceIds),
      record.envelope.authorizationFingerprint,
      record.request.requestId,
      record.correlationId ?? null,
      record.evaluationMicroseconds,
    ];
    await this.db.executeQuery(CompiledQuery.raw(`
      INSERT INTO ${table} (
        ${keyColumn},
        plane_code,
        decision,
        reason_code,
        evaluator_contract_version,
        evaluator_revision,
        subject_principal_id,
        permission_id,
        entity_operation_id,
        resource_type,
        resource_key_sha256,
        global_epoch,
        ${middleEpochColumn},
        plane_epoch,
        entitlement_version,
        catalog_sha256,
        role_compilation_sha256,
        matched_plane_membership_ids,
        matched_deny_ids,
        matched_override_ids,
        matched_record_acl_ids,
        matched_delegation_ids,
        evidence_ids,
        evidence_sha256,
        request_id,
        correlation_id,
        evaluation_microseconds
      ) VALUES (
        $1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::uuid, $9::uuid,
        $10, $11, $12::bigint, $13::bigint, $14::bigint, $15, $16, $17,
        $18::uuid[], $19::uuid[], $20::uuid[], $21::uuid[], $22::uuid[],
        $23::jsonb, $24, $25, $26::uuid, $27::bigint
      )
    `, [...parameters]));
  }

  private async appendCanonicalDecision(
    record: AuthorizationDecisionAuditRecord,
    resourceId: string | null,
    tenantId: string,
    networkAccountId: string | null,
  ): Promise<void> {
    const result = record.envelope.result;
    const evidence = result.evidence;
    const action = evidence.canonicalCode.split(".").at(-1) ?? "authorize";
    const resourceType = record.request.mode === "entity_resource"
      ? "entity_record"
      : record.request.mode === "collection"
      ? "entity_collection"
      : "registered_capability";
    const context = {
      authorizationFingerprint: record.envelope.authorizationFingerprint,
      evaluatorContractVersion: CANONICAL_AUTHORIZATION_CONTRACT_VERSION,
      evaluatorRevision: this.evaluatorRevision,
      entitlementEvidenceId: evidence.entitlementEvidenceId,
      entityOperationId: record.request.mode === "registered_capability"
        ? null
        : record.request.entityOperationId,
      matchingDenyIds: evidence.matchingDenyIds,
      matchingAllowProofIds: evidence.matchingAllowProofIds,
      planeMembershipEvidenceId: evidence.planeMembershipEvidenceId ?? null,
      catalogVersion: evidence.catalogVersion,
      policyVersion: evidence.policyVersion,
      networkAccountId,
    };

    await this.db.executeQuery(CompiledQuery.raw(`
      INSERT INTO audit.authorization_decision_evidence (
        tenant_id,
        plane_code,
        decision,
        subject_principal_id,
        subject_type,
        permission_code,
        action,
        resource_type,
        resource_id,
        policy_code,
        policy_version,
        reason_codes,
        evaluation_duration_ms,
        correlation_id,
        request_id,
        context,
        occurred_at
      ) VALUES (
        $1::uuid, $2, $3, $4::uuid, 'user', $5, $6, $7, $8,
        $9, $10, $11::text[], $12::integer, $13::uuid, $14, $15::jsonb, $16
      )
    `, [
      tenantId,
      this.plane,
      result.decision,
      record.request.subject.principalId,
      evidence.canonicalCode,
      action,
      resourceType,
      resourceId,
      "canonical_authorization",
      evidence.policyVersion,
      [result.reason],
      Math.max(0, Math.ceil(record.evaluationMicroseconds / 1_000)),
      record.correlationId ?? null,
      record.request.requestId,
      JSON.stringify(context),
      record.request.evaluatedAt,
    ]));
  }

  private async loadEpoch(
    tenantOrAccountId: string,
  ): Promise<{ global: number; boundary: number; plane: number }> {
    // `admin` remains an API compatibility label. Database rows use the
    // canonical physical-plane vocabulary: athyper, neon, mesh.
    const databasePlane = this.plane === "admin" ? "athyper" : this.plane;
    const rows = await this.db.executeQuery<{
      global_epoch: string | number;
      boundary_epoch: string | number;
      plane_epoch: string | number;
    }>(CompiledQuery.raw(`
      SELECT
        COALESCE((
          SELECT epoch FROM runtime_meta.authorization_epoch
          WHERE scope_kind = 'global'
        ), 0) AS global_epoch,
        COALESCE((
          SELECT epoch FROM runtime_meta.authorization_epoch
          WHERE scope_kind = 'tenant' AND tenant_id = $1::uuid
        ), 0) AS boundary_epoch,
        COALESCE((
          SELECT epoch FROM runtime_meta.authorization_epoch
          WHERE scope_kind = 'plane' AND tenant_id = $1::uuid AND plane_code = $2
        ), 0) AS plane_epoch
    `, [tenantOrAccountId, databasePlane]));
    const row = rows.rows[0];
    return {
      global: Number(row?.global_epoch ?? 0),
      boundary: Number(row?.boundary_epoch ?? 0),
      plane: Number(row?.plane_epoch ?? 0),
    };
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
