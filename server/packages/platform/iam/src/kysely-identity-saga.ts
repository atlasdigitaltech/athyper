import { sql, type Kysely, type Transaction } from "kysely";
import type {
  DesiredApplicationAccess,
  DesiredOrganizationProjection,
  IdentitySagaCoordinate,
  IdentitySagaRepository,
  IdentitySagaWork,
  ProviderCallbackRepository,
  ProviderIdentityCallback,
  PlaneLocalIdentityAuthority,
} from "./identity-saga.js";
import { createHash } from "node:crypto";

type Db = Record<string, never>;
type Executor = Kysely<Db> | Transaction<Db>;
type Row = Record<string, unknown>;
type TransactionRunner = <T>(
  work: (tx: Transaction<Db>) => Promise<T>,
) => Promise<T>;

class IdentitySagaSuccessFenceRejected extends Error {}

export class KyselyIdentitySagaRepository implements IdentitySagaRepository {
  constructor(private readonly run: TransactionRunner) {}

  claim(input: {
    workerId: string;
    claimTokenHash: string;
    claimedAt: string;
    leaseExpiresAt: string;
  }): Promise<IdentitySagaWork | undefined> {
    return this.run(async (tx) => {
      await sql`UPDATE trustiam.identity_saga_attempt SET status='failed',failure_class='transient',error_code='IDENTITY_LEASE_EXPIRED',terminal_at=${input.claimedAt}::timestamptz,next_attempt_at=${input.claimedAt}::timestamptz,updated_by=created_by WHERE status IN('claimed','running') AND lease_expires_at<=${input.claimedAt}::timestamptz`.execute(
        tx,
      );
      const source = (
        await sql<Row>`SELECT projection.*
        FROM trustiam.identity_projection projection
        WHERE projection.reconciliation_status IN('pending','drifted','failed')
          AND NOT EXISTS(SELECT 1 FROM trustiam.identity_saga_attempt open_attempt WHERE open_attempt.authority_tenant_id=projection.authority_tenant_id AND open_attempt.identity_projection_id=projection.id AND open_attempt.status IN('claimed','running'))
          AND COALESCE((SELECT CASE WHEN latest.status='dead_letter' THEN latest.replay_requested_at IS NOT NULL WHEN latest.status='failed' THEN latest.next_attempt_at<=${input.claimedAt}::timestamptz ELSE true END FROM trustiam.identity_saga_attempt latest WHERE latest.authority_tenant_id=projection.authority_tenant_id AND latest.identity_projection_id=projection.id ORDER BY latest.attempt_no DESC LIMIT 1),true)
        ORDER BY projection.updated_at NULLS FIRST,projection.created_at
        FOR UPDATE OF projection SKIP LOCKED LIMIT 1`.execute(tx)
      ).rows[0];
      if (!source) return undefined;
      const tenantId = text(source, "authority_tenant_id"),
        identityId = text(source, "id"),
        desiredVersion = integer(source, "desired_version"),
        desiredHash = text(source, "desired_hash");
      const sequence = (
        await sql<{
          attempt_no: number;
          fencing_token: string;
        }>`SELECT coalesce(max(attempt_no),0)::int+1 attempt_no,coalesce(max(fencing_token),0)::bigint+1 fencing_token FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenantId}::uuid AND identity_projection_id=${identityId}::uuid`.execute(
          tx,
        )
      ).rows[0]!;
      const attempt = (
        await sql<Row>`INSERT INTO trustiam.identity_saga_attempt(authority_tenant_id,identity_projection_id,desired_version,desired_hash,attempt_no,worker_id,claim_token_hash,fencing_token,status,lease_expires_at,manual_replay_of,created_at,created_by)
        VALUES(${tenantId}::uuid,${identityId}::uuid,${desiredVersion},${desiredHash},${sequence.attempt_no},${input.workerId},${input.claimTokenHash},${Number(sequence.fencing_token)},'claimed',${input.leaseExpiresAt}::timestamptz,(SELECT id FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenantId}::uuid AND identity_projection_id=${identityId}::uuid AND status='dead_letter' AND replay_requested_at IS NOT NULL ORDER BY attempt_no DESC LIMIT 1),${input.claimedAt}::timestamptz,${text(source, "created_by")}::uuid) RETURNING id`.execute(
          tx,
        )
      ).rows[0]!;
      return mapWork(source, {
        attemptId: text(attempt, "id"),
        attemptNo: sequence.attempt_no,
        fencingToken: Number(sequence.fencing_token),
        claimTokenHash: input.claimTokenHash,
      });
    });
  }

  async current(work: IdentitySagaWork): Promise<boolean> {
    const row = await this.run(
      async (tx) =>
        (
          await sql<{
            current: boolean;
          }>`SELECT EXISTS(SELECT 1 FROM trustiam.identity_projection projection WHERE projection.authority_tenant_id=${work.authorityTenantId}::uuid AND projection.id=${work.identityId}::uuid AND projection.desired_version=${work.desiredVersion} AND projection.desired_hash=${work.desiredHash} AND NOT EXISTS(SELECT 1 FROM trustiam.identity_saga_attempt newer WHERE newer.authority_tenant_id=projection.authority_tenant_id AND newer.identity_projection_id=projection.id AND newer.fencing_token>${work.fencingToken})) current`.execute(
            tx,
          )
        ).rows[0],
    );
    return row?.current === true;
  }

  start(
    coordinate: IdentitySagaCoordinate,
    startedAt: string,
  ): Promise<boolean> {
    return this.run((tx) =>
      this.transition(
        coordinate,
        "claimed",
        sql`status='running',started_at=${startedAt}::timestamptz`,
        tx,
      ),
    );
  }

  async succeed(
    coordinate: IdentitySagaCoordinate,
    input: {
      observedAt: string;
      providerSubject?: string;
      receipt: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean> {
    try {
      return await this.run(async (tx) => {
        const changed = await this.transition(
          coordinate,
          "running",
          sql`status='succeeded',terminal_at=${input.observedAt}::timestamptz,receipt=${JSON.stringify(input.receipt)}::jsonb`,
          tx,
        );
        if (!changed) return false;
        const updated =
          await sql`UPDATE trustiam.identity_projection SET reconciliation_status='in_sync',provider_subject=coalesce(${input.providerSubject ?? null},provider_subject),observed_status=desired_status,observed_version=desired_version,observed_hash=desired_hash,observed_at=${input.observedAt}::timestamptz,last_error_code=NULL,updated_by=created_by WHERE id=${coordinate.identityId}::uuid AND desired_version=${coordinate.desiredVersion} AND desired_hash=${coordinate.desiredHash}`.execute(
            tx,
          );
        if (Number(updated.numAffectedRows ?? 0) !== 1)
          throw new IdentitySagaSuccessFenceRejected();
        await appendSagaEvidence(tx, coordinate, "succeeded", input.receipt);
        return true;
      });
    } catch (error) {
      if (error instanceof IdentitySagaSuccessFenceRejected) return false;
      throw error;
    }
  }

  fail(
    coordinate: IdentitySagaCoordinate,
    input: {
      failedAt: string;
      classification: "transient" | "permanent" | "stale";
      errorCode: string;
      nextAttemptAt?: string;
      deadLetter: boolean;
      receipt: Readonly<Record<string, unknown>>;
    },
  ): Promise<boolean> {
    return this.run(async (tx) => {
      const changed =
        (await this.transition(
          coordinate,
          "running",
          sql`status=${input.deadLetter ? "dead_letter" : "failed"},failure_class=${input.classification},error_code=${input.errorCode},next_attempt_at=${input.nextAttemptAt ?? null}::timestamptz,terminal_at=${input.failedAt}::timestamptz,receipt=${JSON.stringify(input.receipt)}::jsonb`,
          tx,
        )) ||
        (await this.transition(
          coordinate,
          "claimed",
          sql`status=${input.deadLetter ? "dead_letter" : "failed"},failure_class=${input.classification},error_code=${input.errorCode},next_attempt_at=${input.nextAttemptAt ?? null}::timestamptz,terminal_at=${input.failedAt}::timestamptz,receipt=${JSON.stringify(input.receipt)}::jsonb`,
          tx,
        ));
      if (!changed) return false;
      await sql`UPDATE trustiam.identity_projection SET reconciliation_status='failed',last_error_code=${input.errorCode},updated_by=created_by WHERE id=${coordinate.identityId}::uuid AND desired_version=${coordinate.desiredVersion} AND desired_hash=${coordinate.desiredHash}`.execute(
        tx,
      );
      await appendSagaEvidence(
        tx,
        coordinate,
        input.deadLetter ? "dead_letter" : "failed",
        {
          ...input.receipt,
          classification: input.classification,
          errorCode: input.errorCode,
        },
      );
      return true;
    });
  }

  async replay(input: {
    authorityTenantId: string;
    deadLetterAttemptId: string;
    requestedBy: string;
    approvedBy: string;
    requestedAt: string;
  }): Promise<boolean> {
    const result = await this.run(async (tx) =>
      sql`UPDATE trustiam.identity_saga_attempt SET replay_requested_at=${input.requestedAt}::timestamptz,replay_requested_by=${input.requestedBy}::uuid,replay_approved_by=${input.approvedBy}::uuid,updated_by=${input.requestedBy}::uuid WHERE authority_tenant_id=${input.authorityTenantId}::uuid AND id=${input.deadLetterAttemptId}::uuid AND status='dead_letter' AND replay_requested_at IS NULL AND ${input.requestedBy}::uuid<>${input.approvedBy}::uuid`.execute(
        tx,
      ),
    );
    return Number(result.numAffectedRows ?? 0) === 1;
  }

  private async transition(
    coordinate: IdentitySagaCoordinate,
    from: string,
    set: ReturnType<typeof sql>,
    executor: Executor,
  ): Promise<boolean> {
    const result =
      await sql`UPDATE trustiam.identity_saga_attempt SET ${set},updated_by=created_by WHERE id=${coordinate.attemptId}::uuid AND identity_projection_id=${coordinate.identityId}::uuid AND status=${from} AND claim_token_hash=${coordinate.claimTokenHash} AND fencing_token=${coordinate.fencingToken} AND desired_version=${coordinate.desiredVersion} AND desired_hash=${coordinate.desiredHash} AND lease_expires_at>clock_timestamp()`.execute(
        executor,
      );
    return Number(result.numAffectedRows ?? 0) === 1;
  }
}

export class KyselyDesiredOrganizationReader {
  constructor(private readonly run: TransactionRunner) {}
  async get(
    organizationId: string,
  ): Promise<DesiredOrganizationProjection | undefined> {
    const row = await this.run(
      async (tx) =>
        (
          await sql<Row>`SELECT organization.*,projection.desired_version,projection.desired_hash,projection.metadata projection_metadata FROM trustiam.organization organization LEFT JOIN LATERAL(SELECT desired_version,desired_hash,metadata FROM trustiam.application_projection WHERE authority_tenant_id=organization.authority_tenant_id AND organization_id=organization.id ORDER BY desired_version DESC LIMIT 1) projection ON true WHERE organization.id=${organizationId}::uuid LIMIT 1`.execute(
            tx,
          )
        ).rows[0],
    );
    if (!row || row["desired_version"] == null || row["desired_hash"] == null)
      return undefined;
    const metadata = object(row["metadata"]),
      purpose = metadata["organizationPurpose"];
    if (!isPurpose(purpose))
      throw new Error("IDENTITY_ORGANIZATION_PURPOSE_INVALID");
    return {
      organizationId: text(row, "id"),
      canonicalPartyId: text(row, "canonical_party_id"),
      purpose,
      realmKey: text(row, "realm_key"),
      externalOrganizationId: text(row, "external_organization_id"),
      displayName: text(row, "display_name"),
      desiredVersion: integer(row, "desired_version"),
      desiredHash: text(row, "desired_hash"),
    };
  }
}

export class KyselyProviderCallbackRepository implements ProviderCallbackRepository {
  constructor(
    private readonly studio: Kysely<Db>,
    private readonly actorId: string,
  ) {}
  async accept(
    callback: ProviderIdentityCallback,
  ): Promise<"accepted" | "duplicate"> {
    const result =
      await sql`INSERT INTO trustiam.provider_identity_callback_inbox(authority_tenant_id,event_id,identity_projection_id,desired_version,desired_hash,provider_sequence,provider_subject,observed_status,disposition,created_by) SELECT authority_tenant_id,${callback.eventId},id,${callback.desiredVersion},${callback.desiredHash},${callback.providerSequence},${callback.providerSubject},${callback.status},'received',${this.actorId}::uuid FROM trustiam.identity_projection WHERE id=${callback.identityId}::uuid ON CONFLICT(authority_tenant_id,event_id) DO NOTHING`.execute(
        this.studio,
      );
    return Number(result.numAffectedRows ?? 0) === 1 ? "accepted" : "duplicate";
  }
  observeIfCurrent(
    callback: ProviderIdentityCallback,
  ): Promise<"applied" | "stale" | "out_of_order"> {
    return this.studio.transaction().execute(async (tx) => {
      const projection = required(
        (
          await sql<Row>`SELECT * FROM trustiam.identity_projection WHERE id=${callback.identityId}::uuid FOR UPDATE`.execute(
            tx,
          )
        ).rows[0],
      );
      let outcome: "applied" | "stale" | "out_of_order";
      if (
        integer(projection, "desired_version") !== callback.desiredVersion ||
        text(projection, "desired_hash") !== callback.desiredHash
      )
        outcome = "stale";
      else if (
        projection["provider_sequence"] != null &&
        integer(projection, "provider_sequence") >= callback.providerSequence
      )
        outcome = "out_of_order";
      else {
        await sql`UPDATE trustiam.identity_projection SET provider_subject=${callback.providerSubject},provider_sequence=${callback.providerSequence},observed_status=${callback.status},observed_version=${callback.desiredVersion},observed_hash=${callback.desiredHash},observed_at=clock_timestamp(),reconciliation_status=CASE WHEN desired_status=${callback.status} THEN 'in_sync'::trustiam.reconciliation_status_d ELSE 'drifted'::trustiam.reconciliation_status_d END,last_error_code=NULL,updated_by=${this.actorId}::uuid WHERE id=${callback.identityId}::uuid`.execute(
          tx,
        );
        outcome = "applied";
      }
      await sql`UPDATE trustiam.provider_identity_callback_inbox SET disposition=${outcome},processed_at=clock_timestamp() WHERE identity_projection_id=${callback.identityId}::uuid AND event_id=${callback.eventId} AND disposition='received'`.execute(
        tx,
      );
      return outcome;
    });
  }
}

/** Applies TrustIAM intent through plane-local authorization rows; it never reads provider attributes as grants. */
export class KyselyPlaneLocalIdentityAuthority implements PlaneLocalIdentityAuthority {
  constructor(
    private readonly studioRun: TransactionRunner,
    private readonly targets: {
      run<T>(
        plane: DesiredApplicationAccess["plane"],
        work: (transaction: Transaction<Db>) => Promise<T>,
      ): Promise<T>;
    },
    private readonly actorId: string,
  ) {}

  async providerSubject(identityId: string): Promise<string | undefined> {
    const row = await this.studioRun(
      async (tx) =>
        (
          await sql<Row>`SELECT provider_subject FROM trustiam.identity_projection WHERE id=${identityId}::uuid LIMIT 1`.execute(
            tx,
          )
        ).rows[0],
    );
    return row?.["provider_subject"]
      ? String(row["provider_subject"])
      : undefined;
  }

  async converge(
    input: Parameters<PlaneLocalIdentityAuthority["converge"]>[0],
  ): Promise<void> {
    for (const application of input.applications)
      await this.targets.run(application.plane, async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${application.targetTenantId}:${input.identityId}`},0))`.execute(
          tx,
        );
        let principal = (
          await sql<Row>`SELECT id,status FROM master.principal WHERE tenant_id=${application.targetTenantId}::uuid AND external_ref=${`trustiam:${input.identityId}`} LIMIT 1 FOR UPDATE`.execute(
            tx,
          )
        ).rows[0];
        if (!principal)
          principal = (
            await sql<Row>`INSERT INTO master.principal(tenant_id,code,name,principal_type,external_ref,provisioning_source,metadata,status,created_by) VALUES(${application.targetTenantId}::uuid,${`iam.${sha256(input.identityId).slice(0, 24)}`},${input.displayName},'user',${`trustiam:${input.identityId}`},'sync',${JSON.stringify({ trustIamIdentityId: input.identityId, personId: input.personId, relationship: input.membership.relationship, sourceRef: input.membership.sourceRef })}::jsonb,'active',${this.actorId}::uuid) RETURNING id,status`.execute(
              tx,
            )
          ).rows[0]!;
        const principalId = text(principal, "id");
        if (principal["status"] === "suspended")
          await sql`UPDATE master.principal SET status='active',updated_by=${this.actorId}::uuid WHERE tenant_id=${application.targetTenantId}::uuid AND id=${principalId}::uuid`.execute(
            tx,
          );
        if (principal["status"] === "deactivated")
          throw new Error("IDENTITY_LOCAL_PRINCIPAL_DEACTIVATED");

        await sql`INSERT INTO master.principal_identity_binding(tenant_id,principal_id,provider_code,realm_key,subject_id,username,is_primary,status,synced_at,sync_status,provider_attributes,metadata,created_by) VALUES(${application.targetTenantId}::uuid,${principalId}::uuid,'keycloak',${input.realmKey},${input.providerSubject},${input.identifier},true,'active',clock_timestamp(),'synced','{}'::jsonb,${JSON.stringify({ trustIamIdentityId: input.identityId, desiredVersion: input.desiredVersion, desiredHash: input.desiredHash })}::jsonb,${this.actorId}::uuid) ON CONFLICT(tenant_id,provider_code,realm_key,subject_id) DO UPDATE SET status='active',is_primary=true,synced_at=clock_timestamp(),sync_status='synced',sync_error_message=NULL,provider_attributes='{}'::jsonb,metadata=EXCLUDED.metadata,updated_by=${this.actorId}::uuid WHERE master.principal_identity_binding.principal_id=EXCLUDED.principal_id`.execute(
          tx,
        );
        const binding = (
          await sql<Row>`SELECT principal_id FROM master.principal_identity_binding WHERE tenant_id=${application.targetTenantId}::uuid AND provider_code='keycloak' AND realm_key=${input.realmKey} AND subject_id=${input.providerSubject}`.execute(
            tx,
          )
        ).rows[0];
        if (!binding || text(binding, "principal_id") !== principalId)
          throw new Error("IDENTITY_BINDING_CONFLICT");

        const admission = (
          await sql<Row>`SELECT id,status FROM authz.plane_membership WHERE tenant_id=${application.targetTenantId}::uuid AND principal_id=${principalId}::uuid AND status IN('pending','active','suspended') ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`.execute(
            tx,
          )
        ).rows[0];
        if (!admission)
          await sql`INSERT INTO authz.plane_membership(tenant_id,principal_id,membership_kind,source_type,source_ref,metadata,status,created_by) VALUES(${application.targetTenantId}::uuid,${principalId}::uuid,'standard','iam_sync',${`trustiam:${input.identityId}`},${JSON.stringify({ desiredVersion: input.desiredVersion, desiredHash: input.desiredHash })}::jsonb,'active',${this.actorId}::uuid)`.execute(
            tx,
          );
        else if (admission["status"] !== "active")
          await sql`UPDATE authz.plane_membership SET status='active',metadata=${JSON.stringify({ desiredVersion: input.desiredVersion, desiredHash: input.desiredHash })}::jsonb,updated_by=${this.actorId}::uuid WHERE id=${text(admission, "id")}::uuid`.execute(
            tx,
          );

        for (const assignment of application.roles) {
          const sourceRef = `trustiam-role:${assignment.roleCode}:${assignment.scopeKind}:${assignment.scopeTargetId}`;
          const group = (
            await sql<Row>`SELECT group_row.id FROM authz.principal_group group_row JOIN authz.group_role assignment_row ON assignment_row.tenant_id=group_row.tenant_id AND assignment_row.group_id=group_row.id AND assignment_row.status='active' JOIN authz.role role_row ON role_row.tenant_id=assignment_row.tenant_id AND role_row.id=assignment_row.role_id AND role_row.code=${assignment.roleCode} AND role_row.status='active' JOIN authz.scope_target scope_row ON scope_row.tenant_id=assignment_row.tenant_id AND scope_row.id=assignment_row.scope_target_id AND scope_row.scope_kind::text=${assignment.scopeKind} AND scope_row.target_id=${assignment.scopeTargetId}::uuid AND scope_row.status='active' WHERE group_row.tenant_id=${application.targetTenantId}::uuid AND group_row.group_kind='iam_managed' AND group_row.source_ref=${sourceRef} AND group_row.status='active' LIMIT 1`.execute(
              tx,
            )
          ).rows[0];
          if (!group)
            throw new Error("IDENTITY_LOCAL_ROLE_SCOPE_MAPPING_MISSING");
          const groupId = text(group, "id"),
            memberRef = `trustiam:${input.identityId}:${input.desiredVersion}`;
          const member = (
            await sql<Row>`SELECT id,status FROM authz.group_member WHERE tenant_id=${application.targetTenantId}::uuid AND group_id=${groupId}::uuid AND principal_id=${principalId}::uuid AND status IN('active','suspended') ORDER BY effective_from DESC LIMIT 1 FOR UPDATE`.execute(
              tx,
            )
          ).rows[0];
          if (!member)
            await sql`INSERT INTO authz.group_member(tenant_id,group_id,principal_id,source_type,source_ref,metadata,status,created_by) VALUES(${application.targetTenantId}::uuid,${groupId}::uuid,${principalId}::uuid,'iam_sync',${memberRef},${JSON.stringify({ desiredHash: input.desiredHash })}::jsonb,'active',${this.actorId}::uuid)`.execute(
              tx,
            );
          else if (member["status"] === "suspended")
            await sql`UPDATE authz.group_member SET status='active',metadata=${JSON.stringify({ desiredHash: input.desiredHash })}::jsonb,updated_by=${this.actorId}::uuid WHERE id=${text(member, "id")}::uuid`.execute(
              tx,
            );
        }
      });
  }

  async revokeAccess(
    input: Parameters<PlaneLocalIdentityAuthority["revokeAccess"]>[0],
  ): Promise<void> {
    for (const application of input.applications)
      await this.targets.run(application.plane, async (tx) => {
        await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${application.targetTenantId}:${input.identityId}`},0))`.execute(
          tx,
        );
        const principal = (
          await sql<Row>`SELECT id,status FROM master.principal WHERE tenant_id=${application.targetTenantId}::uuid AND external_ref=${`trustiam:${input.identityId}`} LIMIT 1 FOR UPDATE`.execute(
            tx,
          )
        ).rows[0];
        if (!principal) return;
        const principalId = text(principal, "id"),
          terminal = input.reason === "deprovisioned";
        await sql`UPDATE authz.group_member SET status='revoked',effective_until=clock_timestamp(),updated_by=${this.actorId}::uuid WHERE tenant_id=${application.targetTenantId}::uuid AND principal_id=${principalId}::uuid AND source_type='iam_sync' AND status IN('active','suspended')`.execute(
          tx,
        );
        await sql`UPDATE authz.plane_membership SET status='revoked',effective_until=clock_timestamp(),updated_by=${this.actorId}::uuid WHERE tenant_id=${application.targetTenantId}::uuid AND principal_id=${principalId}::uuid AND source_type='iam_sync' AND status IN('pending','active','suspended')`.execute(
          tx,
        );
        await sql`UPDATE master.principal_identity_binding SET status=${terminal ? "revoked" : "disabled"},is_primary=false,updated_by=${this.actorId}::uuid WHERE tenant_id=${application.targetTenantId}::uuid AND principal_id=${principalId}::uuid AND provider_code='keycloak' AND status IN('active','disabled')`.execute(
          tx,
        );
        if (
          principal["status"] === "active" ||
          (terminal && principal["status"] === "suspended")
        )
          await sql`UPDATE master.principal SET status=${terminal ? "deactivated" : "suspended"},metadata=metadata||${JSON.stringify({ accessState: input.reason, trustIamDesiredVersion: input.desiredVersion, trustIamDesiredHash: input.desiredHash })}::jsonb,updated_by=${this.actorId}::uuid WHERE tenant_id=${application.targetTenantId}::uuid AND id=${principalId}::uuid`.execute(
            tx,
          );
      });
  }
}

async function appendSagaEvidence(
  tx: Transaction<Db>,
  coordinate: IdentitySagaCoordinate,
  outcome: "succeeded" | "failed" | "dead_letter",
  receipt: Readonly<Record<string, unknown>>,
): Promise<void> {
  await sql`INSERT INTO event.outbox(tenant_id,topic,event_type,event_key,entity_type,entity_id,aggregate_type,aggregate_id,event_version,actor_id,source,payload,created_by)
    SELECT authority_tenant_id,'iam.authority',${`trustiam.identity.saga.${outcome}`},${`identity-saga:${coordinate.attemptId}`},'trustiam.identity_saga_attempt',id,'trustiam.identity_projection',identity_projection_id,LEAST(desired_version,2147483647)::integer,created_by,'trustiam-identity-saga',${JSON.stringify({ attemptId: coordinate.attemptId, identityId: coordinate.identityId, desiredVersion: coordinate.desiredVersion, desiredHash: coordinate.desiredHash, outcome, receipt })}::jsonb,created_by
      FROM trustiam.identity_saga_attempt WHERE id=${coordinate.attemptId}::uuid`.execute(
    tx,
  );
}

function mapWork(
  row: Row,
  attempt: Pick<
    IdentitySagaWork,
    "attemptId" | "attemptNo" | "fencingToken" | "claimTokenHash"
  >,
): IdentitySagaWork {
  return {
    ...attempt,
    identityId: text(row, "id"),
    authorityTenantId: text(row, "authority_tenant_id"),
    personId: text(row, "person_id"),
    identifier: text(row, "normalized_identifier"),
    displayName: text(row, "display_name"),
    realmKey: text(row, "realm_key"),
    desiredVersion: integer(row, "desired_version"),
    desiredHash: text(row, "desired_hash"),
    status: text(row, "desired_status") as IdentitySagaWork["status"],
    membership: {
      organizationId: text(row, "organization_id"),
      relationship: text(
        row,
        "relationship_kind",
      ) as IdentitySagaWork["membership"]["relationship"],
      sourceRef: text(row, "source_ref"),
    },
    applications: applications(row["desired_applications"]),
  };
}
function applications(value: unknown): readonly DesiredApplicationAccess[] {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(parsed)) throw new Error("IDENTITY_APPLICATIONS_INVALID");
  return parsed as DesiredApplicationAccess[];
}
function object(value: unknown): Record<string, unknown> {
  return (
    typeof value === "string" ? JSON.parse(value) : (value ?? {})
  ) as Record<string, unknown>;
}
function isPurpose(
  value: unknown,
): value is DesiredOrganizationProjection["purpose"] {
  return (
    value === "tenant_employer" ||
    value === "supplier_portal" ||
    value === "customer_portal"
  );
}
function required<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("IDENTITY_PROJECTION_NOT_FOUND");
  return value;
}
function text(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`IDENTITY_ROW_INVALID:${key}`);
  return value;
}
function integer(row: Row, key: string): number {
  const value = Number(row[key]);
  if (!Number.isSafeInteger(value))
    throw new Error(`IDENTITY_ROW_INVALID:${key}`);
  return value;
}
function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
