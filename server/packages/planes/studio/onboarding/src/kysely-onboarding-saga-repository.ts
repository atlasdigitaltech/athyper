import { sql, type Kysely, type Transaction } from "kysely";
import type {
  OnboardingCase,
  OnboardingCommandOperation,
  OnboardingResourceObservation,
  OnboardingResourceStatus,
} from "@athyper/contract-athyper-onboarding";
import type { ProvisioningCommandReceipt } from "@athyper/server-contract-integration";
import type { OnboardingSagaRepository } from "./saga.js";
import {
  validateCompilation,
  type OnboardingCaseWriteResult,
  type OnboardingCompilation,
  type OnboardingLifecycleRepository,
} from "./case-lifecycle.js";

type Database = Record<string, never>;
export type OnboardingTransaction = Transaction<Database>;
type OnboardingDatabase = Kysely<Database>;
type Row = Record<string, unknown>;

export class KyselyOnboardingSagaRepository
  implements
    OnboardingSagaRepository,
    OnboardingLifecycleRepository<OnboardingTransaction>
{
  constructor(private readonly database: OnboardingDatabase) {}
  async createDraft(
    input: Parameters<
      OnboardingLifecycleRepository<OnboardingTransaction>["createDraft"]
    >[0],
    transaction: OnboardingTransaction,
  ): Promise<OnboardingCaseWriteResult> {
    const marker = {
      idempotencyKeyHash: input.idempotencyKeyHash,
      fingerprint: input.fingerprint,
    };
    const inserted =
      await sql<Row>`INSERT INTO onboarding.onboarding_case(id,tenant_id,case_code,canonical_party_id,source_onboarding_mode,requested_by_principal_id,activation_criticality,request_metadata,request_payload,created_by) VALUES(${input.caseId}::uuid,${input.tenantId}::uuid,${input.caseCode},${input.canonicalPartyId}::uuid,${input.sourceMode},${input.requestedBy}::uuid,${input.activationCriticality},${json({ ...input.requestMetadata, _command: marker })}::jsonb,${json(input.requestPayload)}::jsonb,${input.requestedBy}::uuid) ON CONFLICT(tenant_id,case_code) DO NOTHING RETURNING *`.execute(
        transaction,
      );
    if (inserted.rows[0]) {
      await sql`INSERT INTO onboarding.onboarding_case_revision(tenant_id,onboarding_case_id,revision_no,from_status,to_status,changed_by,change_context) VALUES(${input.tenantId}::uuid,${input.caseId}::uuid,1,NULL,'draft',${input.requestedBy}::uuid,${json(marker)}::jsonb)`.execute(
        transaction,
      );
      return result(inserted.rows[0], false);
    }
    const current = required(
        (
          await sql<Row>`SELECT * FROM onboarding.onboarding_case WHERE tenant_id=${input.tenantId}::uuid AND case_code=${input.caseCode} FOR UPDATE`.execute(
            transaction,
          )
        ).rows[0],
      ),
      stored = object(current["request_metadata"])["_command"] as
        Record<string, unknown> | undefined;
    if (
      stored?.["idempotencyKeyHash"] === input.idempotencyKeyHash &&
      stored["fingerprint"] === input.fingerprint
    )
      return result(current, true);
    throw new Error("ONBOARDING_IDEMPOTENCY_CONFLICT");
  }
  async loadCase(caseId: string): Promise<OnboardingCase | undefined> {
    const db = this.reader();
    const caseRow = (
      await sql<Row>`SELECT * FROM onboarding.onboarding_case WHERE id=${caseId}::uuid LIMIT 1`.execute(
        db,
      )
    ).rows[0];
    if (!caseRow) return undefined;
    const targetRows = (
      await sql<Row>`SELECT * FROM onboarding.onboarding_case_target WHERE onboarding_case_id=${caseId}::uuid ORDER BY id`.execute(
        db,
      )
    ).rows;
    const resourceRows = (
      await sql<Row>`SELECT * FROM onboarding.onboarding_case_resource WHERE onboarding_case_id=${caseId}::uuid ORDER BY onboarding_case_target_id,resource_key`.execute(
        db,
      )
    ).rows;
    return {
      id: str(caseRow, "id"),
      tenantId: str(caseRow, "tenant_id"),
      caseCode: str(caseRow, "case_code"),
      canonicalPartyId: str(caseRow, "canonical_party_id"),
      status: str(caseRow, "status") as OnboardingCase["status"],
      desiredVersion: Number(caseRow["desired_version"]),
      desiredHash: String(caseRow["desired_hash"] ?? ""),
      targets: targetRows.map((target) => ({
        targetId: str(target, "id"),
        plane: str(
          target,
          "target_plane",
        ) as OnboardingCase["targets"][number]["plane"],
        targetTenantId: str(target, "target_tenant_id"),
        criticality: str(
          target,
          "criticality",
        ) as OnboardingCase["targets"][number]["criticality"],
        resources: resourceRows
          .filter(
            (resource) =>
              resource["onboarding_case_target_id"] === target["id"],
          )
          .map((resource) => {
            const metadata = object(resource["metadata"]);
            return {
              resourceKey: str(resource, "resource_key"),
              resourceKind: str(resource, "resource_kind"),
              desiredState: object(metadata["desiredState"]),
              ...(metadata["accessGates"]
                ? { accessGates: object(metadata["accessGates"]) }
                : {}),
              retention: String(
                metadata["retention"] ?? "deletable",
              ) as "deletable",
            };
          }),
      })),
    };
  }
  async listObservations(
    caseId: string,
  ): Promise<readonly OnboardingResourceObservation[]> {
    const rows = (
      await sql<Row>`SELECT onboarding_case_target_id,resource_key,remote_resource_id,applied_version,applied_hash,resource_status,coalesce(updated_at,last_attempt_at,created_at) observed_at,audit_log_id,last_error_code FROM onboarding.onboarding_case_resource WHERE onboarding_case_id=${caseId}::uuid ORDER BY onboarding_case_target_id,resource_key`.execute(
        this.reader(),
      )
    ).rows;
    return rows.map((row) => ({
      targetId: str(row, "onboarding_case_target_id"),
      resourceKey: str(row, "resource_key"),
      ...(row["remote_resource_id"]
        ? { resourceId: str(row, "remote_resource_id") }
        : {}),
      ...(row["applied_version"]
        ? { appliedVersion: Number(row["applied_version"]) }
        : {}),
      ...(row["applied_hash"] ? { appliedHash: str(row, "applied_hash") } : {}),
      status: str(row, "resource_status") as OnboardingResourceStatus,
      observedAt: iso(row["observed_at"]),
      ...(row["audit_log_id"] ? { evidenceId: str(row, "audit_log_id") } : {}),
      ...(row["last_error_code"]
        ? { failureCode: str(row, "last_error_code") }
        : {}),
    }));
  }
  async recordReceipt(
    caseId: string,
    targetId: string,
    resourceKey: string,
    operation: OnboardingCommandOperation,
    receipt: ProvisioningCommandReceipt,
  ): Promise<void> {
    let conflict = false;
    await this.database.transaction().execute(async (transaction) => {
      const row = required(
        (
          await sql<Row>`SELECT desired_version,desired_hash FROM onboarding.onboarding_case_resource WHERE onboarding_case_id=${caseId}::uuid AND onboarding_case_target_id=${targetId}::uuid AND resource_key=${resourceKey} FOR UPDATE`.execute(
            transaction,
          )
        ).rows[0],
      );
      const desiredVersion = Number(row["desired_version"]),
        desiredHash = str(row, "desired_hash");
      conflict =
        receipt.status === "applied" &&
        operation === "apply" &&
        (receipt.appliedVersion !== desiredVersion ||
          receipt.appliedHash !== desiredHash);
      const status =
        receipt.status === "rejected" || conflict
          ? "failed"
          : operation === "revoke"
            ? "revoked"
            : operation === "retain"
              ? "retained"
              : "applied";
      const errorCode = conflict
        ? "ONBOARDING_SAME_VERSION_HASH_CONFLICT"
        : (receipt.errorCode ?? null);
      const updated =
        await sql`UPDATE onboarding.onboarding_case_resource SET resource_status=${status},remote_resource_id=coalesce(${receipt.resourceId ?? null},remote_resource_id),applied_version=CASE WHEN ${conflict} THEN applied_version ELSE coalesce(${receipt.appliedVersion ?? null},applied_version) END,applied_hash=CASE WHEN ${conflict} THEN applied_hash ELSE coalesce(${receipt.appliedHash ?? null},applied_hash) END,command_execution_id=${receipt.executionId}::uuid,outbox_id=${receipt.outboxEventId ?? null}::uuid,last_error_code=${errorCode},last_attempt_at=now(),updated_at=now(),updated_by=current_setting('app.current_principal_id')::uuid WHERE onboarding_case_id=${caseId}::uuid AND onboarding_case_target_id=${targetId}::uuid AND resource_key=${resourceKey}`.execute(
          transaction,
        );
      if (Number(updated.numAffectedRows) !== 1)
        throw new Error("ONBOARDING_RESOURCE_NOT_FOUND");
    });
    if (conflict) throw new Error("ONBOARDING_SAME_VERSION_HASH_CONFLICT");
  }
  async transition(
    input: Parameters<
      OnboardingLifecycleRepository<OnboardingTransaction>["transition"]
    >[0],
    transaction: OnboardingTransaction,
  ): Promise<OnboardingCaseWriteResult> {
    const current = required(
      (
        await sql<Row>`SELECT * FROM onboarding.onboarding_case WHERE tenant_id=${input.tenantId}::uuid AND id=${input.caseId}::uuid FOR UPDATE`.execute(
          transaction,
        )
      ).rows[0],
    );
    const prior = (
      await sql<Row>`SELECT change_context FROM onboarding.onboarding_case_revision WHERE tenant_id=${input.tenantId}::uuid AND onboarding_case_id=${input.caseId}::uuid ORDER BY revision_no DESC`.execute(
        transaction,
      )
    ).rows.find(
      (row) =>
        object(row["change_context"])["idempotencyKeyHash"] ===
        input.idempotencyKeyHash,
    );
    if (prior) {
      const marker = object(prior["change_context"]);
      if (marker["fingerprint"] !== input.fingerprint)
        throw new Error("ONBOARDING_IDEMPOTENCY_CONFLICT");
      return result(current, true);
    }
    if (current["status"] !== input.from)
      throw new Error("ONBOARDING_EXPECTED_STATUS_CONFLICT");
    const currentVersion = Number(current["desired_version"]);
    if (
      input.expectedDesiredVersion !== undefined &&
      input.expectedDesiredVersion !== currentVersion
    )
      throw new Error("ONBOARDING_DESIRED_VERSION_CONFLICT");
    const currentHash = current["desired_hash"]
      ? String(current["desired_hash"])
      : undefined;
    const changed = Boolean(
      input.desiredHash && input.desiredHash !== currentHash,
    );
    const desiredVersion = input.desiredHash
      ? currentHash && changed
        ? currentVersion + 1
        : currentVersion
      : currentVersion;
    const desiredHash = input.desiredHash ?? currentHash;
    if (input.compilation) {
      if (!desiredHash)
        throw new Error("ONBOARDING_CANONICAL_REVISION_REQUIRED");
      validateCompilation(input.compilation);
      await this.replaceCompilation(
        input.tenantId,
        input.caseId,
        input.actorId,
        input.compilation,
        desiredVersion,
        desiredHash,
        transaction,
      );
    }
    // A changed canonical revision advances every compiled resource's desired
    // coordinates. Receipt validation must compare against the version sent by
    // the saga, while retaining the previous applied coordinates for drift.
    if (changed && !input.compilation)
      await sql`UPDATE onboarding.onboarding_case_resource SET desired_version=${desiredVersion},desired_hash=${desiredHash},updated_at=${input.changedAt}::timestamptz,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND onboarding_case_id=${input.caseId}::uuid`.execute(
        transaction,
      );
    const revisionNo = Number(
      (
        await sql<Row>`SELECT coalesce(max(revision_no),0)+1 value FROM onboarding.onboarding_case_revision WHERE tenant_id=${input.tenantId}::uuid AND onboarding_case_id=${input.caseId}::uuid`.execute(
          transaction,
        )
      ).rows[0]?.["value"] ?? 1,
    );
    const context = {
      idempotencyKeyHash: input.idempotencyKeyHash,
      fingerprint: input.fingerprint,
      ...(input.canonicalRevision
        ? { canonicalRevision: input.canonicalRevision }
        : {}),
    };
    await sql`INSERT INTO onboarding.onboarding_case_revision(tenant_id,onboarding_case_id,revision_no,from_status,to_status,changed_by,changed_at,change_reason,change_context) VALUES(${input.tenantId}::uuid,${input.caseId}::uuid,${revisionNo},${input.from},${input.to},${input.actorId}::uuid,${input.changedAt}::timestamptz,${input.reason ?? null},${json(context)}::jsonb)`.execute(
      transaction,
    );
    const decisionStatus =
      input.to === "approved"
        ? "approved"
        : input.to === "rejected"
          ? "rejected"
          : null;
    if (decisionStatus)
      await sql`UPDATE onboarding.onboarding_compilation_decision SET decision_status=${decisionStatus},decided_by=${input.actorId}::uuid,decided_at=${input.changedAt}::timestamptz,decision_note=${input.reason ?? null},updated_at=${input.changedAt}::timestamptz,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND onboarding_case_id=${input.caseId}::uuid`.execute(
        transaction,
      );
    const updated = required(
      (
        await sql<Row>`UPDATE onboarding.onboarding_case SET status=${input.to},desired_version=${desiredVersion},desired_hash=coalesce(${input.desiredHash ?? null},desired_hash),decision_status=coalesce(${decisionStatus},decision_status),decision_reason=CASE WHEN ${decisionStatus} IS NULL THEN decision_reason ELSE coalesce(${input.reason ?? null},upper(${decisionStatus})) END,decision_at=CASE WHEN ${decisionStatus} IS NULL THEN decision_at ELSE ${input.changedAt}::timestamptz END,decided_by=CASE WHEN ${decisionStatus} IS NULL THEN decided_by ELSE ${input.actorId}::uuid END,status_changed_at=${input.changedAt}::timestamptz,status_changed_by=${input.actorId}::uuid,submitted_at=CASE WHEN ${input.to}='submitted' THEN coalesce(submitted_at,${input.changedAt}::timestamptz) ELSE submitted_at END,activated_at=CASE WHEN ${input.to}='active' THEN coalesce(activated_at,${input.changedAt}::timestamptz) ELSE activated_at END,offboarded_at=CASE WHEN ${input.to}='offboarded' THEN coalesce(offboarded_at,${input.changedAt}::timestamptz) ELSE offboarded_at END,updated_at=${input.changedAt}::timestamptz,updated_by=${input.actorId}::uuid WHERE tenant_id=${input.tenantId}::uuid AND id=${input.caseId}::uuid AND status=${input.from} RETURNING *`.execute(
          transaction,
        )
      ).rows[0],
    );
    return result(updated, false);
  }
  async revokeExpiredGuestAccess(
    input: { tenantId: string; actorId: string; now: string; limit: number },
    transaction: OnboardingTransaction,
  ): Promise<readonly string[]> {
    const rows = (
      await sql<Row>`WITH candidates AS (SELECT id FROM onboarding.onboarding_case_guest_access WHERE tenant_id=${input.tenantId}::uuid AND revoked_at IS NULL AND expires_at<=${input.now}::timestamptz ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT ${input.limit}) UPDATE onboarding.onboarding_case_guest_access guest SET revoked_at=${input.now}::timestamptz,revoked_by_principal_id=${input.actorId}::uuid,updated_by=${input.actorId}::uuid FROM candidates WHERE guest.id=candidates.id RETURNING guest.id`.execute(
        transaction,
      )
    ).rows;
    return rows.map((row) => str(row, "id"));
  }
  async resolveWorkItem(
    input: {
      tenantId: string;
      caseId: string;
      workItemId: string;
      actorId: string;
    },
    transaction: OnboardingTransaction,
  ): Promise<boolean> {
    const result =
      await sql`DELETE FROM onboarding.onboarding_case_work_item WHERE tenant_id=${input.tenantId}::uuid AND onboarding_case_id=${input.caseId}::uuid AND work_item_id=${input.workItemId}::uuid`.execute(
        transaction,
      );
    return Number(result.numAffectedRows) === 1;
  }
  private async replaceCompilation(
    tenantId: string,
    caseId: string,
    actorId: string,
    value: OnboardingCompilation,
    desiredVersion: number,
    desiredHash: string,
    transaction: OnboardingTransaction,
  ) {
    await sql`DELETE FROM onboarding.onboarding_step_dependency WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    await sql`DELETE FROM onboarding.onboarding_case_check WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    await sql`DELETE FROM onboarding.onboarding_case_resource WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    await sql`DELETE FROM onboarding.onboarding_compilation_decision WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    await sql`DELETE FROM onboarding.onboarding_case_step WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    await sql`DELETE FROM onboarding.onboarding_case_target WHERE tenant_id=${tenantId}::uuid AND onboarding_case_id=${caseId}::uuid`.execute(
      transaction,
    );
    for (const target of value.targets) {
      await sql`INSERT INTO onboarding.onboarding_case_target(id,tenant_id,onboarding_case_id,target_plane,target_tenant_id,requested_projection_id,requested_plan_id,requested_workspace_id,requested_scope_target_id,status,criticality,created_by) VALUES(${target.id}::uuid,${tenantId}::uuid,${caseId}::uuid,${target.plane},${target.tenantId}::uuid,${target.requestedProjectionId ?? null}::uuid,${target.requestedPlanId ?? null}::uuid,${target.requestedWorkspaceId ?? null}::uuid,${target.requestedScopeTargetId ?? null}::uuid,'qualifying',${target.criticality},${actorId}::uuid)`.execute(
        transaction,
      );
      await sql`INSERT INTO onboarding.onboarding_compilation_decision(tenant_id,onboarding_case_id,onboarding_case_target_id,decision_payload,audit_log_id,created_by) VALUES(${tenantId}::uuid,${caseId}::uuid,${target.id}::uuid,${json({ desiredVersion, desiredHash, targetPlane: target.plane })}::jsonb,${value.evidenceId}::uuid,${actorId}::uuid)`.execute(
        transaction,
      );
    }
    for (const step of value.steps)
      await sql`INSERT INTO onboarding.onboarding_case_step(id,tenant_id,onboarding_case_id,onboarding_case_target_id,step_code,step_title,status,criticality,execution_priority,audit_log_id,created_by) VALUES(${step.id}::uuid,${tenantId}::uuid,${caseId}::uuid,${step.targetId ?? null}::uuid,${step.code},${step.title},'pending',${step.criticality ?? "independent"},${step.priority ?? 0},${value.evidenceId}::uuid,${actorId}::uuid)`.execute(
        transaction,
      );
    for (const step of value.steps)
      for (const dependency of step.dependsOn ?? [])
        await sql`INSERT INTO onboarding.onboarding_step_dependency(tenant_id,onboarding_case_id,depends_on_step_id,depends_on_this_step_id,created_by) VALUES(${tenantId}::uuid,${caseId}::uuid,${dependency}::uuid,${step.id}::uuid,${actorId}::uuid)`.execute(
          transaction,
        );
    for (const check of value.checks)
      await sql`INSERT INTO onboarding.onboarding_case_check(id,tenant_id,onboarding_case_id,onboarding_case_step_id,onboarding_case_target_id,resource_type,check_code,check_name,audit_log_id,check_metadata,created_by) VALUES(${check.id}::uuid,${tenantId}::uuid,${caseId}::uuid,${check.stepId ?? null}::uuid,${check.targetId}::uuid,${check.resourceType},${check.code},${check.name},${value.evidenceId}::uuid,${json(check.metadata ?? {})}::jsonb,${actorId}::uuid)`.execute(
        transaction,
      );
    for (const resource of value.resources)
      await sql`INSERT INTO onboarding.onboarding_case_resource(id,tenant_id,onboarding_case_id,onboarding_case_target_id,resource_kind,resource_key,desired_version,desired_hash,metadata,audit_log_id,created_by) VALUES(${resource.id}::uuid,${tenantId}::uuid,${caseId}::uuid,${resource.targetId}::uuid,${resource.kind},${resource.key},${desiredVersion},${desiredHash},${json({ desiredState: resource.desiredState, accessGates: resource.accessGates ?? {}, retention: resource.retention })}::jsonb,${value.evidenceId}::uuid,${actorId}::uuid)`.execute(
        transaction,
      );
  }
  private reader() {
    return this.database;
  }
}
function result(row: Row, replayed: boolean): OnboardingCaseWriteResult {
  return {
    caseId: str(row, "id"),
    status: str(row, "status") as OnboardingCaseWriteResult["status"],
    desiredVersion: Number(row["desired_version"]),
    desiredHash: String(row["desired_hash"] ?? ""),
    replayed,
  };
}
function required<T>(value: T | undefined | null): T {
  if (value == null) throw new Error("ONBOARDING_CASE_NOT_FOUND");
  return value;
}
function str(row: Row, key: string) {
  const value = row[key];
  if (typeof value !== "string")
    throw new Error(`ONBOARDING_ROW_INVALID:${key}`);
  return value;
}
function object(value: unknown): Record<string, unknown> {
  if (value == null) return {};
  return (typeof value === "string" ? JSON.parse(value) : value) as Record<
    string,
    unknown
  >;
}
function json(value: unknown) {
  return JSON.stringify(value);
}
function iso(value: unknown) {
  return new Date(String(value)).toISOString();
}
