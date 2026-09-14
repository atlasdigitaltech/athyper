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
  KeycloakIdentityProviderAdapter,
  KyselyDesiredOrganizationReader,
  KyselyIdentitySagaRepository,
  KyselyPlaneLocalIdentityAuthority,
} from "@athyper/server-platform-iam";

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
const rollback = Symbol("g5-internal-cross-plane-rollback");
const keycloak =
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
          await sql`SELECT t.id tenant_id,np.id neon_actor,c.id company_id,c.legal_entity_id,l_scope.id legal_scope_id FROM master.tenant t JOIN master.principal np ON np.tenant_id=t.id AND np.status='active' JOIN master.company_code c ON c.tenant_id=t.id AND c.status='active' JOIN authz.scope_target l_scope ON l_scope.tenant_id=t.id AND l_scope.scope_kind='legal_entity' AND l_scope.target_id=c.legal_entity_id AND l_scope.status='active' ORDER BY t.id,np.id,c.id LIMIT 50`.execute(
            ntx,
          )
        ).rows;
        let coordinate;
        for (const candidate of candidates) {
          const actors = (
            await sql`SELECT id FROM master.principal WHERE tenant_id=${String(candidate.tenant_id)}::uuid AND status='active' ORDER BY id LIMIT 1`.execute(
              stx,
            )
          ).rows;
          if (actors.length) {
            coordinate = { ...candidate, studio_actor: actors[0].id };
            break;
          }
        }
        if (!coordinate)
          throw new Error(
            "G5 internal workforce probe requires a shared tenant, Studio actor, company and legal-entity scope",
          );
        const tenant = String(coordinate.tenant_id),
          neonActor = String(coordinate.neon_actor),
          studioActor = String(coordinate.studio_actor),
          company = String(coordinate.company_id),
          legalEntity = String(coordinate.legal_entity_id),
          legalScope = String(coordinate.legal_scope_id);
        const permission = String(
          (
            await sql`SELECT p.id FROM authz.permission p JOIN authz.permission_scope_kind sk ON sk.permission_id=p.id AND sk.scope_kind='legal_entity' AND sk.status='active' WHERE p.status='published' ORDER BY p.canonical_code LIMIT 1`.execute(
              ntx,
            )
          ).rows[0]?.id,
        );
        if (!permission)
          throw new Error(
            "G5 internal workforce probe requires one published legal-entity permission",
          );
        const person = randomUUID(),
          employee = randomUUID(),
          employment = randomUUID(),
          intake = randomUUID(),
          party = randomUUID(),
          applicationProjection = randomUUID(),
          role = randomUUID(),
          rolePermission = randomUUID(),
          group = randomUUID(),
          groupRole = randomUUID();
        const identifier = `g5-internal-${person}@example.test`;
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${neonActor},true)`.execute(
          ntx,
        );
        await sql`INSERT INTO master.person(id,tenant_id,code,name,first_name,last_name,display_name,primary_email,status,created_by) VALUES(${person}::uuid,${tenant}::uuid,${`G5.INT.${person}`},'G5 Internal Worker','G5','Worker','G5 Internal Worker',${identifier},'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO master.employee(id,tenant_id,code,name,person_id,employee_number,first_name,last_name,display_name,email,employment_type,company_code_id,hire_date,status,created_by) VALUES(${employee}::uuid,${tenant}::uuid,${`G5.EMP.${employee}`},'G5 Internal Worker',${person}::uuid,${`G5-${employee.slice(0, 20)}`},'G5','Worker','G5 Internal Worker',${identifier},'full_time',${company}::uuid,current_date,'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO master.employment(id,tenant_id,code,name,person_id,employee_id,legal_entity_id,company_code_id,employment_number,employment_type,employment_status,hire_date,status,created_by) VALUES(${employment}::uuid,${tenant}::uuid,${`G5.EMPL.${employment}`},'G5 Internal Employment',${person}::uuid,${employee}::uuid,${legalEntity}::uuid,${company}::uuid,${`G5-${employment.slice(0, 20)}`},'full_time','active',current_date,'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO document.workforce_iam_projection(id,tenant_id,employee_id,employer_organization_id,requested_principal_creation,desired_state,observed_state,idempotency_key,created_by) VALUES(${intake}::uuid,${tenant}::uuid,${employee}::uuid,${legalEntity}::uuid,true,'member','pending','g5-internal-live-intake',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.role(id,tenant_id,code,name,role_kind,source_type,status,created_by) VALUES(${role}::uuid,${tenant}::uuid,'workforce.employee','G5 employee','custom','manual','draft',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.role_permission(id,tenant_id,role_id,permission_id,created_by) VALUES(${rolePermission}::uuid,${tenant}::uuid,${role}::uuid,${permission}::uuid,${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`UPDATE authz.role SET status='active',updated_by=${neonActor}::uuid WHERE id=${role}::uuid`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.principal_group(id,tenant_id,code,name,group_kind,source_type,source_ref,status,created_by) VALUES(${group}::uuid,${tenant}::uuid,${`g5.employee.${group.slice(0, 12)}`},'G5 employee','iam_managed','iam_sync',${`trustiam-role:workforce.employee:legal_entity:${legalEntity}`},'active',${neonActor}::uuid)`.execute(
          ntx,
        );
        await sql`INSERT INTO authz.group_role(id,tenant_id,group_id,role_id,scope_target_id,propagation_mode,source_type,source_ref,status,created_by) VALUES(${groupRole}::uuid,${tenant}::uuid,${group}::uuid,${role}::uuid,${legalScope}::uuid,'exact','manual','g5-internal-live','active',${neonActor}::uuid)`.execute(
          ntx,
        );

        await sql`SET LOCAL session_replication_role='replica'`.execute(stx);
        await sql`INSERT INTO master.canonical_party(id,authority_tenant_id,party_kind,legal_name,display_name,status,created_by) VALUES(${party}::uuid,${tenant}::uuid,'legal_entity','G5 Internal Employer','G5 Internal Employer','active',${studioActor}::uuid)`.execute(
          stx,
        );
        await sql`SET LOCAL session_replication_role='origin'`.execute(stx);
        await sql`INSERT INTO trustiam.organization(id,authority_tenant_id,canonical_party_id,realm_key,external_organization_id,display_name,status,metadata,created_by) VALUES(${legalEntity}::uuid,${tenant}::uuid,${party}::uuid,${keycloak?.realm ?? "neon"},${keycloak?.organizationId ?? `g5:${legalEntity}`},'G5 Internal Employer','active','{"organizationPurpose":"tenant_employer"}'::jsonb,${studioActor}::uuid)`.execute(
          stx,
        );
        await sql`INSERT INTO trustiam.application_projection(id,authority_tenant_id,organization_id,target_plane,target_tenant_id,desired_version,desired_hash,status,reconciliation_status,effective_from,metadata,created_by) VALUES(${applicationProjection}::uuid,${tenant}::uuid,${legalEntity}::uuid,'neon',${tenant}::uuid,1,${"f".repeat(64)},'active','in_sync',clock_timestamp(),'{}'::jsonb,${studioActor}::uuid)`.execute(
          stx,
        );

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
          workerId: "g5-internal",
          repository: deliveryRepository,
          consumer: async () => consumer,
          now: () => new Date("2026-09-03T00:00:00Z"),
        });
        const applications = [
          { plane: "studio", targetTenantId: tenant, roles: [] },
          {
            plane: "neon",
            targetTenantId: tenant,
            roles: [
              {
                roleCode: "workforce.employee",
                scopeKind: "legal_entity",
                scopeTargetId: legalEntity,
              },
            ],
          },
          { plane: "mesh", targetTenantId: tenant, roles: [] },
        ];
        let identityId;
        const commandAndDeliver = async (version, state, key) => {
          if (version > 1)
            await sql`UPDATE document.workforce_iam_projection SET desired_state=${state},row_version=${version},updated_at=clock_timestamp(),updated_by=${neonActor}::uuid WHERE id=${intake}::uuid`.execute(
              ntx,
            );
          const command = (
            await sql`SELECT * FROM document.command_workforce_iam_projection(${tenant}::uuid,${intake}::uuid,${version},${key},${neonActor}::uuid,NULL)`.execute(
              ntx,
            )
          ).rows[0];
          assert.equal(
            command?.desired_status,
            state === "member" ? "active" : state,
          );
          assert.deepEqual(await delivery.deliver(), { applied: 1 });
          identityId ??= String(
            (
              await sql`SELECT id FROM trustiam.identity_projection WHERE authority_tenant_id=${tenant}::uuid AND relationship_kind='employer' AND source_ref=${`employment:${employment}`}`.execute(
                stx,
              )
            ).rows[0]?.id,
          );
          await sql`UPDATE trustiam.identity_projection SET realm_key=${keycloak?.realm ?? "neon"},desired_applications=${JSON.stringify(applications)}::jsonb WHERE id=${identityId}::uuid`.execute(
            stx,
          );
          return command;
        };
        const active = await commandAndDeliver(
          1,
          "member",
          "g5-internal-live-command-1",
        );
        await sql`UPDATE event.outbox SET status='failed',available_at=clock_timestamp(),processed_at=NULL,published_at=NULL WHERE id=${String(active.outbox_id)}::uuid`.execute(
          ntx,
        );
        assert.deepEqual(await delivery.deliver(), { applied: 1 });
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.command_execution WHERE tenant_id=${tenant}::uuid AND command_code='trustiam.internal_workforce.intent.consume'`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          1,
        );

        const repository = new KyselyIdentitySagaRepository((work) =>
          work(stx),
        );
        const local = new KyselyPlaneLocalIdentityAuthority(
          (work) => work(stx),
          {
            run: async (plane, work) =>
              work(plane === "studio" ? stx : plane === "neon" ? ntx : mtx),
          },
          "00000000-0000-0000-0000-000000000000",
        );
        const real = keycloak
          ? new KeycloakIdentityProviderAdapter({
              baseUrl: keycloak.baseUrl,
              adminRealm: keycloak.realm,
              clientId: keycloak.clientId,
              credentialReference: "memory:g5-internal",
              secrets: {
                resolve: async () => ({
                  bytes: new TextEncoder().encode(keycloak.clientSecret),
                  version: "disposable-v1",
                }),
              },
            })
          : undefined;
        let failOnce = true;
        const providerCalls = [];
        const provider = {
          inviteOrCreate: async (input) => {
            providerCalls.push("identity");
            if (failOnce) {
              failOnce = false;
              throw Object.assign(new Error("provider unavailable"), {
                code: "PROVIDER_UNAVAILABLE",
              });
            }
            return real
              ? real.inviteOrCreate(input)
              : { providerSubject: `g5-internal:${identityId}` };
          },
          ensureMembership: async (input) => {
            providerCalls.push(`membership:${input.relationship}`);
            return real?.ensureMembership(input);
          },
          ensureApplication: async (input) => {
            providerCalls.push(`application:${input.plane}`);
            return real?.ensureApplication(input);
          },
          suspend: async (input) => {
            providerCalls.push("suspend");
            return real?.suspend(input);
          },
          deprovision: async (input) => {
            providerCalls.push("deprovision");
            return real?.deprovision(input);
          },
        };
        let now = new Date();
        const metrics = [];
        const saga = new IdentitySagaWorker({
          workerId: "g5-internal",
          repository,
          provider,
          local,
          organizations: new KyselyDesiredOrganizationReader((work) =>
            work(stx),
          ),
          alerts: {
            metric: (value) => metrics.push(value),
            deadLetter: async () => {},
          },
          now: () => now,
          maxAttempts: 3,
        });
        assert.equal(await saga.runOne("g5-internal-claim-1"), "retry");
        now = new Date(now.getTime() + 120000);
        const recovered = await saga.runOne("g5-internal-claim-2");
        if (recovered !== "succeeded") {
          const failure = (
            await sql`SELECT failure_class,error_code FROM trustiam.identity_saga_attempt WHERE identity_projection_id=${identityId}::uuid ORDER BY attempt_no DESC LIMIT 1`.execute(
              stx,
            )
          ).rows[0];
          throw new Error(
            `G5_INTERNAL_SAGA_RECOVERY_FAILED:${recovered}:${failure?.failure_class}:${failure?.error_code}`,
          );
        }
        const planes = { studio: stx, neon: ntx, mesh: mtx },
          principals = {};
        for (const [plane, tx] of Object.entries(planes)) {
          const principal = (
            await sql`SELECT id,status,auth_epoch FROM master.principal WHERE tenant_id=${tenant}::uuid AND external_ref=${`trustiam:${identityId}`}`.execute(
              tx,
            )
          ).rows[0];
          assert.deepEqual(
            { status: principal?.status, epoch: Number(principal?.auth_epoch) },
            { status: "active", epoch: 0 },
            plane,
          );
          principals[plane] = String(principal?.id);
        }
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM authz.group_member WHERE tenant_id=${tenant}::uuid AND principal_id=${principals.neon}::uuid AND group_id=${group}::uuid AND status='active'`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
        );

        await commandAndDeliver(2, "suspended", "g5-internal-live-command-2");
        now = new Date(now.getTime() + 120000);
        assert.equal(await saga.runOne("g5-internal-claim-3"), "succeeded");
        for (const [plane, tx] of Object.entries(planes))
          assert.deepEqual(
            (
              await sql`SELECT status,auth_epoch FROM master.principal WHERE id=${principals[plane]}::uuid`.execute(
                tx,
              )
            ).rows[0],
            { status: "suspended", auth_epoch: 1 },
            plane,
          );
        await commandAndDeliver(
          3,
          "deprovisioned",
          "g5-internal-live-command-3",
        );
        now = new Date(now.getTime() + 120000);
        assert.equal(await saga.runOne("g5-internal-claim-4"), "succeeded");
        for (const [plane, tx] of Object.entries(planes))
          assert.deepEqual(
            (
              await sql`SELECT status,auth_epoch FROM master.principal WHERE id=${principals[plane]}::uuid`.execute(
                tx,
              )
            ).rows[0],
            { status: "deactivated", auth_epoch: 2 },
            plane,
          );
        assert.deepEqual(
          providerCalls.filter((value) => value.startsWith("application:")),
          ["application:studio", "application:neon", "application:mesh"],
        );
        assert.deepEqual(providerCalls.slice(-2), ["suspend", "deprovision"]);
        assert.deepEqual(metrics, [
          { classification: "transient", outcome: "retry" },
        ]);
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM trustiam.identity_saga_attempt WHERE authority_tenant_id=${tenant}::uuid AND identity_projection_id=${identityId}::uuid AND status='succeeded'`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          3,
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM event.outbox WHERE tenant_id=${tenant}::uuid AND source='trustiam-identity-saga' AND aggregate_id=${identityId}::uuid`.execute(
                stx,
              )
            ).rows[0]?.value,
          ),
          4,
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
          "person",
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM master.employee WHERE tenant_id=${tenant}::uuid AND id=${employee}::uuid`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
          "employee",
        );
        assert.equal(
          Number(
            (
              await sql`SELECT count(*) value FROM master.employment WHERE tenant_id=${tenant}::uuid AND id=${employment}::uuid`.execute(
                ntx,
              )
            ).rows[0]?.value,
          ),
          1,
          "employment",
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
process.stdout.write(
  "G5_INTERNAL_WORKFORCE_IAM_FULL_THREE_PLANE_ROLLBACK_OK\n",
);
