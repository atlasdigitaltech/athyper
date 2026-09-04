import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import {
  ExternalWorkerIdentityDeliveryWorker,
  ExternalWorkerIdentityIntentConsumer,
  KyselyExternalWorkerIdentityDeliveryRepository,
  KyselyExternalWorkerIdentityIntentRepository,
  IdentitySagaWorker,
  IdentityReplayService,
  KeycloakIdentityProviderAdapter,
  KyselyDesiredOrganizationReader,
  KyselyIdentitySagaRepository,
  KyselyPlaneLocalIdentityAuthority,
} from "../../../../packages/platform/iam/src/index.ts";

const neonUrl =
  process.env.ATHYPER_NEON_DATABASE_ADMIN_URL ?? process.env.DATABASE_ADMIN_URL;
const studioUrl = process.env.ATHYPER_PLATFORM_DATABASE_ADMIN_URL;
const meshUrl =
  process.env.ATHYPER_MESH_DATABASE_ADMIN_URL ??
  process.env.MESH_DATABASE_ADMIN_URL;
if (!neonUrl || !studioUrl || !meshUrl)
  throw new Error(
    "ATHYPER_NEON_DATABASE_ADMIN_URL, ATHYPER_PLATFORM_DATABASE_ADMIN_URL and ATHYPER_MESH_DATABASE_ADMIN_URL are required",
  );
const neon = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: neonUrl, max: 1 }),
  }),
});
const studio = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: studioUrl, max: 1 }),
  }),
});
const mesh = new Kysely({
  dialect: new PostgresDialect({
    pool: new pg.Pool({ connectionString: meshUrl, max: 1 }),
  }),
});
const rollback = Symbol("g5-cross-plane-rollback");
const keycloakConfig =
  process.env.G5_KEYCLOAK_BASE_URL &&
  process.env.G5_KEYCLOAK_REALM &&
  process.env.G5_KEYCLOAK_CLIENT_ID &&
  process.env.G5_KEYCLOAK_CLIENT_SECRET &&
  process.env.G5_KEYCLOAK_ORGANIZATION_ID
    ? {
        baseUrl: process.env.G5_KEYCLOAK_BASE_URL,
        realm: process.env.G5_KEYCLOAK_REALM,
        clientId: process.env.G5_KEYCLOAK_CLIENT_ID,
        clientSecret: process.env.G5_KEYCLOAK_CLIENT_SECRET,
        organizationId: process.env.G5_KEYCLOAK_ORGANIZATION_ID,
      }
    : undefined;
try {
  await neon.transaction().execute(async (ntx) =>
    studio.transaction().execute(async (stx) =>
      mesh.transaction().execute(async (mtx) => {
        const candidates = (
          await sql`SELECT n.id tenant_id,np.id neon_actor,s.id supplier_id,c.id company_code_id,l.id legal_entity_id,scope.id legal_entity_scope_id FROM master.tenant n JOIN master.principal np ON np.tenant_id=n.id AND np.status='active' JOIN master.supplier s ON s.tenant_id=n.id JOIN master.company_code c ON c.tenant_id=n.id JOIN master.legal_entity l ON l.tenant_id=n.id JOIN authz.scope_target scope ON scope.tenant_id=n.id AND scope.scope_kind='legal_entity' AND scope.target_id=l.id AND scope.status='active' ORDER BY n.id,np.id,s.id,c.id,l.id LIMIT 50`.execute(
            ntx,
          )
        ).rows;
        let coordinate;
        for (const candidate of candidates) {
          const studioActors = (
            await sql`SELECT id FROM master.principal WHERE tenant_id=${String(candidate.tenant_id)}::uuid AND status='active' ORDER BY id LIMIT 2`.execute(
              stx,
            )
          ).rows;
          if (studioActors.length === 2) {
            coordinate = {
              ...candidate,
              studio_actor: studioActors[0].id,
              studio_approver: studioActors[1].id,
            };
            break;
          }
        }
        if (!coordinate)
          throw new Error(
            "G5 cross-plane probe requires a shared tenant with principals and NEON workforce dimensions",
          );
        const tenant = String(coordinate.tenant_id),
          neonActor = String(coordinate.neon_actor),
          studioActor = String(coordinate.studio_actor),
          studioApprover = String(coordinate.studio_approver),
          supplier = String(coordinate.supplier_id),
          company = String(coordinate.company_code_id),
          legalEntity = String(coordinate.legal_entity_id),
          legalEntityScope = String(coordinate.legal_entity_scope_id);
        const permission = String(
          (
            await sql`SELECT permission.id FROM authz.permission permission JOIN authz.permission_scope_kind scope_kind ON scope_kind.permission_id=permission.id AND scope_kind.scope_kind='legal_entity' AND scope_kind.status='active' WHERE permission.status='published' ORDER BY permission.canonical_code LIMIT 1`.execute(
              ntx,
            )
          ).rows[0]?.id,
        );
        if (!permission)
          throw new Error(
            "G5 live saga requires one published legal-entity permission",
          );
        const person = randomUUID(),
          workerId = randomUUID(),
          sow = randomUUID(),
          engagement = randomUUID(),
          party = randomUUID(),
          applicationProjection = randomUUID(),
          role = randomUUID(),
          rolePermission = randomUUID(),
          group = randomUUID(),
          groupRole = randomUUID();
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${neonActor},true)`.execute(
          ntx,
        );
        await sql`INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,display_name,primary_email,status,created_by) VALUES(${person}::uuid,${tenant}::uuid,${`G5.${person}`},'G5 Cross Plane Worker','G5','Worker','G5 Cross Plane Worker',${`g5-${person}@example.test`},'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO master.external_worker(id,tenant_id,person_id,worker_number,default_classification,status,created_by) VALUES(${workerId}::uuid,${tenant}::uuid,${person}::uuid,${`G5.${workerId.slice(0, 24)}`},'consultant','active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO document.statement_of_work(id,tenant_id,company_code_id,legal_entity_id,supplier_id,code,name,status,created_by) VALUES(${sow}::uuid,${tenant}::uuid,${company}::uuid,${legalEntity}::uuid,${supplier}::uuid,${`G5.${sow.slice(0, 24)}`},'G5 cross-plane SOW','active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO document.worker_engagement(id,tenant_id,external_worker_id,supplier_id,company_code_id,legal_entity_id,statement_of_work_id,code,name,worker_classification,start_date,end_date,currency_code,readiness_evidence,onboarding_status,access_status,status,activated_at,activated_by,created_by) VALUES(${engagement}::uuid,${tenant}::uuid,${workerId}::uuid,${supplier}::uuid,${company}::uuid,${legalEntity}::uuid,${sow}::uuid,${`G5.${engagement.slice(0, 24)}`},'G5 cross-plane engagement','consultant',current_date,current_date+30,'USD','{"eligible":true}'::jsonb,'completed','not_requested','active',clock_timestamp(),${neonActor}::uuid,${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,status,created_by) VALUES(${role}::uuid,${tenant}::uuid,'workforce.external_worker','G5 external worker','custom','manual','draft',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES(${rolePermission}::uuid,${tenant}::uuid,${role}::uuid,${permission}::uuid,${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`UPDATE authz.role SET status='active',updated_by=${neonActor}::uuid WHERE id=${role}::uuid`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(${group}::uuid,${tenant}::uuid,${`g5.external-worker.${group.slice(0, 12)}`},'G5 external worker','iam_managed','iam_sync',${`trustiam-role:workforce.external_worker:legal_entity:${legalEntity}`},'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) VALUES(${groupRole}::uuid,${tenant}::uuid,${group}::uuid,${role}::uuid,${legalEntityScope}::uuid,'exact','manual','g5-live-saga','active',${neonActor}::uuid)`.execute(
          ntx,
        );
        const command = (
          await sql`SELECT * FROM document.command_worker_engagement_iam_projection(${tenant}::uuid,${engagement}::uuid,1,'g5-cross-plane-command-0001',${neonActor}::uuid,NULL)`.execute(
            ntx,
          )
        ).rows[0];
        assert.equal(command?.desired_status, "active");
        // Fixture-only bypass for the pre-existing canonical-party graph trigger defect; restore
        // ordinary trigger behavior before exercising the production consumer path.
        await sql`SET LOCAL session_replication_role = 'replica'`.execute(stx);
        await sql`INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,status,created_by) VALUES(${party}::uuid,${tenant}::uuid,'legal_entity','G5 Probe Legal Entity','G5 Probe Legal Entity','active',${studioActor}::uuid)`.execute(
          stx,
        );
        await sql`SET LOCAL session_replication_role = 'origin'`.execute(stx);

        const deliveryRepository =
          new KyselyExternalWorkerIdentityDeliveryRepository((work) =>
            work(ntx),
          );
        const consumer = new ExternalWorkerIdentityIntentConsumer(
          new KyselyExternalWorkerIdentityIntentRepository(
            (work) => work(stx),
            studioActor,
          ),
        );
        const delivery = new ExternalWorkerIdentityDeliveryWorker({
          workerId: "g5-cross-plane",
          repository: deliveryRepository,
          consumer: async () => consumer,
          now: () => new Date("2026-09-03T00:00:00Z"),
        });
        assert.deepEqual(await delivery.deliver(), { retry: 1 });
        let source = (
          await sql`SELECT status,attempts,last_error FROM event.outbox WHERE id=${String(command.outbox_id)}::uuid`.execute(
            ntx,
          )
        ).rows[0];
        assert.equal(source?.status, "failed");
        assert.equal(source?.attempts, 1);
        assert.match(
          String(source?.last_error),
          /^EXTERNAL_WORKER_INTENT_ORGANIZATION_MISSING:/,
        );

        await sql`INSERT INTO trustiam.organization(id,authority_tenant_id,canonical_party_id,realm_key,external_organization_id,display_name,status,metadata,created_by) VALUES(${legalEntity}::uuid,${tenant}::uuid,${party}::uuid,${keycloakConfig?.realm ?? "neon"},${keycloakConfig?.organizationId ?? `g5:${legalEntity}`},'G5 Probe Employer','active','{"organizationPurpose":"tenant_employer"}'::jsonb,${studioActor}::uuid)`.execute(
          stx,
        );
        await sql`INSERT INTO trustiam.application_projection(id,authority_tenant_id,organization_id,target_plane,target_tenant_id,desired_version,desired_hash,status,reconciliation_status,effective_from,metadata,created_by) VALUES(${applicationProjection}::uuid,${tenant}::uuid,${legalEntity}::uuid,'neon',${tenant}::uuid,1,${"b".repeat(64)},'active','in_sync',clock_timestamp(),'{}'::jsonb,${studioActor}::uuid)`.execute(
          stx,
        );
        await sql`UPDATE event.outbox SET available_at=clock_timestamp() WHERE id=${String(command.outbox_id)}::uuid`.execute(
          ntx,
        );
        const recovered = await delivery.deliver();
        source = (
          await sql`SELECT status,attempts,last_error FROM event.outbox WHERE id=${String(command.outbox_id)}::uuid`.execute(
            ntx,
          )
        ).rows[0];
        assert.deepEqual(recovered, { applied: 1 }, JSON.stringify(source));
        assert.deepEqual(source, {
          status: "completed",
          attempts: 2,
          last_error: "studio:applied",
        });
        const projection = (
          await sql`SELECT person_id,organization_id,relationship_kind,source_ref,desired_version,desired_hash,desired_status,reconciliation_status FROM trustiam.identity_projection WHERE authority_tenant_id=${tenant}::uuid AND source_ref=${`worker_engagement:${engagement}`}`.execute(
            stx,
          )
        ).rows[0];
        assert.equal(String(projection?.person_id), person);
        assert.equal(String(projection?.organization_id), legalEntity);
        assert.equal(projection?.relationship_kind, "external_worker");
        assert.equal(Number(projection?.desired_version), 2);
        assert.equal(projection?.desired_hash, command.desired_hash);
        assert.equal(projection?.reconciliation_status, "pending");
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.command_execution WHERE tenant_id=${tenant}::uuid AND command_code='trustiam.external_worker.intent.consume'`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          1,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.outbox WHERE tenant_id=${tenant}::uuid AND topic='trustiam-identity-intent' AND aggregate_id=${engagement}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          1,
        );

        await sql`UPDATE event.outbox SET status='failed',available_at=clock_timestamp(),processed_at=NULL,published_at=NULL,attempts=2 WHERE id=${String(command.outbox_id)}::uuid`.execute(
          ntx,
        );
        assert.deepEqual(await delivery.deliver(), { applied: 1 });
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.outbox WHERE tenant_id=${tenant}::uuid AND topic='trustiam-identity-intent' AND aggregate_id=${engagement}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          1,
        );

        const identityId = String(
          (
            await sql`SELECT id FROM trustiam.identity_projection WHERE authority_tenant_id=${tenant}::uuid AND source_ref=${`worker_engagement:${engagement}`}`.execute(
              stx,
            )
          ).rows[0]?.id,
        );
        const applications = [
          { plane: "studio", targetTenantId: tenant, roles: [] },
          {
            plane: "neon",
            targetTenantId: tenant,
            roles: [
              {
                roleCode: "workforce.external_worker",
                scopeKind: "legal_entity",
                scopeTargetId: legalEntity,
              },
            ],
          },
          { plane: "mesh", targetTenantId: tenant, roles: [] },
        ];
        await sql`UPDATE trustiam.identity_projection SET realm_key=${keycloakConfig?.realm ?? "neon"},desired_applications=${JSON.stringify(applications)}::jsonb WHERE id=${identityId}::uuid`.execute(
          stx,
        );
        const sagaRepository = new KyselyIdentitySagaRepository((work) =>
          work(stx),
        );
        const localAuthority = new KyselyPlaneLocalIdentityAuthority(
          (work) => work(stx),
          {
            run: async (plane, work) =>
              work(plane === "studio" ? stx : plane === "neon" ? ntx : mtx),
          },
          "00000000-0000-0000-0000-000000000000",
        );
        const providerCalls = [];
        let providerUnavailable = true;
        const realProvider = keycloakConfig
          ? new KeycloakIdentityProviderAdapter({
              baseUrl: keycloakConfig.baseUrl,
              adminRealm: keycloakConfig.realm,
              clientId: keycloakConfig.clientId,
              credentialReference: "memory:g5-combined",
              secrets: {
                resolve: async () => ({
                  bytes: new TextEncoder().encode(keycloakConfig.clientSecret),
                  version: "disposable-v1",
                }),
              },
            })
          : undefined;
        const provider = {
          inviteOrCreate: async (input) => {
            providerCalls.push(`identity:${input.idempotencyKey}`);
            if (providerUnavailable)
              throw Object.assign(new Error("provider unavailable"), {
                code: "PROVIDER_UNAVAILABLE",
              });
            return realProvider
              ? realProvider.inviteOrCreate(input)
              : { providerSubject: `g5-provider:${identityId}` };
          },
          ensureMembership: async (input) => {
            providerCalls.push(`membership:${input.relationship}`);
            return realProvider?.ensureMembership(input);
          },
          ensureApplication: async (input) => {
            providerCalls.push(`application:${input.plane}`);
            return realProvider?.ensureApplication(input);
          },
          suspend: async (input) => {
            providerCalls.push("suspend");
            return realProvider?.suspend(input);
          },
          deprovision: async (input) => {
            providerCalls.push("deprovision");
            return realProvider?.deprovision(input);
          },
        };
        const metrics = [];
        let sagaNow = new Date();
        const saga = new IdentitySagaWorker({
          workerId: "g5-live-saga",
          repository: sagaRepository,
          provider,
          local: localAuthority,
          organizations: new KyselyDesiredOrganizationReader((work) =>
            work(stx),
          ),
          alerts: {
            metric: (value) => metrics.push(value),
            deadLetter: async () => {},
          },
          now: () => sagaNow,
          maxAttempts: 3,
        });
        assert.equal(await saga.runOne("g5-live-claim-1"), "retry");
        providerUnavailable = false;
        sagaNow = new Date(sagaNow.getTime() + 120000);
        const recoveredSaga = await saga.runOne("g5-live-claim-2");
        if (recoveredSaga !== "succeeded") {
          const failure = (
            await sql`SELECT failure_class,error_code FROM trustiam.identity_saga_attempt WHERE identity_projection_id=${identityId}::uuid ORDER BY attempt_no DESC LIMIT 1`.execute(
              stx,
            )
          ).rows[0];
          throw new Error(
            `G5_SAGA_RECOVERY_FAILED:${recoveredSaga}:${failure?.failure_class}:${failure?.error_code}`,
          );
        }
        assert.deepEqual(
          providerCalls.filter((call) => call.startsWith("application:")),
          ["application:studio", "application:neon", "application:mesh"],
        );
        const targetTransactions = { studio: stx, neon: ntx, mesh: mtx },
          localPrincipals = {};
        for (const [plane, transaction] of Object.entries(targetTransactions)) {
          const principal = (
            await sql`SELECT id,status,auth_epoch FROM master.principal WHERE tenant_id=${tenant}::uuid AND external_ref=${`trustiam:${identityId}`}`.execute(
              transaction,
            )
          ).rows[0];
          assert.equal(principal?.status, "active", plane);
          assert.equal(Number(principal?.auth_epoch), 0, plane);
          localPrincipals[plane] = principal;
          assert.equal(
            Number(
              (
                await sql`SELECT count(*) value FROM master.principal_identity_binding WHERE tenant_id=${tenant}::uuid AND principal_id=${String(principal?.id)}::uuid AND status='active'`.execute(
                  transaction,
                )
              ).rows[0]?.value,
            ),
            1,
            plane,
          );
          assert.equal(
            Number(
              (
                await sql`SELECT count(*) value FROM authz.plane_membership WHERE tenant_id=${tenant}::uuid AND principal_id=${String(principal?.id)}::uuid AND status='active'`.execute(
                  transaction,
                )
              ).rows[0]?.value,
            ),
            1,
            plane,
          );
        }
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM authz.group_member WHERE tenant_id=${tenant}::uuid AND principal_id=${String(localPrincipals.neon?.id)}::uuid AND group_id=${group}::uuid AND status='active'`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
        );

        await sql`UPDATE trustiam.identity_projection SET desired_version=3,desired_hash=${"c".repeat(64)},desired_status='suspended',reconciliation_status='pending',last_error_code=NULL,updated_by=${studioActor}::uuid WHERE id=${identityId}::uuid`.execute(
          stx,
        );
        sagaNow = new Date(sagaNow.getTime() + 120000);
        assert.equal(await saga.runOne("g5-live-claim-3"), "succeeded");
        for (const [plane, transaction] of Object.entries(targetTransactions))
          assert.deepEqual(
            (
              await sql`SELECT status,auth_epoch FROM master.principal WHERE id=${String(localPrincipals[plane]?.id)}::uuid`.execute(
                transaction,
              )
            ).rows[0],
            { status: "suspended", auth_epoch: 1 },
            plane,
          );
        await sql`UPDATE trustiam.identity_projection SET desired_version=4,desired_hash=${"d".repeat(64)},desired_status='deprovisioned',reconciliation_status='pending',last_error_code=NULL,updated_by=${studioActor}::uuid WHERE id=${identityId}::uuid`.execute(
          stx,
        );
        sagaNow = new Date(sagaNow.getTime() + 120000);
        assert.equal(await saga.runOne("g5-live-claim-4"), "succeeded");
        for (const [plane, transaction] of Object.entries(targetTransactions))
          assert.deepEqual(
            (
              await sql`SELECT status,auth_epoch FROM master.principal WHERE id=${String(localPrincipals[plane]?.id)}::uuid`.execute(
                transaction,
              )
            ).rows[0],
            { status: "deactivated", auth_epoch: 2 },
            plane,
          );
        assert.deepEqual(providerCalls.slice(-2), ["suspend", "deprovision"]);
        assert.deepEqual(metrics, [
          { classification: "transient", outcome: "retry" },
        ]);
        await sql`UPDATE trustiam.identity_projection SET desired_version=5,desired_hash=${"e".repeat(64)},desired_status='active',reconciliation_status='pending',last_error_code=NULL,updated_by=${studioActor}::uuid WHERE id=${identityId}::uuid`.execute(
          stx,
        );
        sagaNow = new Date(sagaNow.getTime() + 120000);
        assert.equal(await saga.runOne("g5-live-claim-5"), "dead_letter");
        const deadLetter = (
          await sql`SELECT id,replay_requested_at FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenant}::uuid AND identity_projection_id=${identityId}::uuid AND status='dead_letter'`.execute(
            stx,
          )
        ).rows[0];
        assert.ok(deadLetter?.id);
        assert.equal(deadLetter?.replay_requested_at, null);
        const replay = new IdentityReplayService(
            sagaRepository,
            { authorize: async () => ({ allowed: true }) },
            () => sagaNow,
          ),
          context = {
            planeKey: "studio",
            tenantId: tenant,
            principalId: studioActor,
            assurance: "elevated",
          };
        await assert.rejects(
          () =>
            replay.request({
              context,
              deadLetterAttemptId: String(deadLetter.id),
              approvedBy: studioActor,
            }),
          /SOD_REQUIRED/,
        );
        assert.equal(
          await replay.request({
            context,
            deadLetterAttemptId: String(deadLetter.id),
            approvedBy: studioApprover,
          }),
          true,
        );
        assert.equal(
          String(
            (
              await sql`SELECT replay_approved_by FROM trustiam.identity_saga_attempt WHERE id=${String(deadLetter.id)}::uuid`.execute(
                stx,
              )
            ).rows[0]?.replay_approved_by,
          ),
          studioApprover,
        );
        const wrongTenant = String(
          (
            await sql`SELECT id FROM master.tenant WHERE id<>${tenant}::uuid ORDER BY id LIMIT 1`.execute(
              stx,
            )
          ).rows[0]?.id,
        );
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(
          stx,
        );
        await sql`SET LOCAL ROLE athyperapp`.execute(stx);
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM trustiam.identity_saga_attempt WHERE id=${String(deadLetter.id)}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          1,
        );
        await sql`SELECT set_config('app.current_tenant_id',${wrongTenant},true)`.execute(
          stx,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM trustiam.identity_saga_attempt WHERE id=${String(deadLetter.id)}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          0,
        );
        await sql`RESET ROLE`.execute(stx);
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(
          stx,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenant}::uuid AND identity_projection_id=${identityId}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          5,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.outbox WHERE tenant_id=${tenant}::uuid AND source='trustiam-identity-saga' AND aggregate_id=${identityId}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          5,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM master.person WHERE tenant_id=${tenant}::uuid AND id=${person}::uuid`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM master.external_worker WHERE tenant_id=${tenant}::uuid AND id=${workerId}::uuid`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM document.worker_engagement WHERE tenant_id=${tenant}::uuid AND id=${engagement}::uuid`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
        );
        throw rollback;
      }),
    ),
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await Promise.all([neon.destroy(), studio.destroy(), mesh.destroy()]);
}
process.stdout.write("G5_EXTERNAL_WORKER_IAM_FULL_THREE_PLANE_ROLLBACK_OK\n");
