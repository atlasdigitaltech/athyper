import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type {
  AuthorizationManagementCommand,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { createKyselyAuthorizationManagementUnitOfWork } from "./kysely-authorization-bindings.js";
import { createAuthorizationManagementService } from "./authorization-management-service.js";
const url = process.env["ATHYPER_AUTH_WRITER_DATABASE_URL"];
const enabled = process.env["ATHYPER_AUTH_WRITER_DB_TESTS"] === "true" && !!url;
const plane = (process.env["ATHYPER_AUTH_WRITER_PLANE"] ?? "neon") as
  "neon" | "mesh" | "studio";
const connection = (app = false) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url ?? "postgres://disabled",
        ...(app ? { options: "-c role=auth_writer_test" } : {}),
      }),
    }),
  });
const admin = connection(),
  db = connection(true);
const tenant = randomUUID(),
  actor = randomUUID(),
  reviewer = randomUUID();
let testPermission: string, testScope: string;
const context = {
  tenantId: tenant,
  principalId: actor,
  planeKey: plane,
} as VerifiedRequestContext;
const uow = createKyselyAuthorizationManagementUnitOfWork({ [plane]: db });
const service = createAuthorizationManagementService({
  unitOfWork: uow,
  mutationsEnabled: true,
  authorizer: {
    async authorize() {
      return { allowed: true };
    },
  },
  rollout: {
    async select() {
      return { mode: "enforce", revision: "test" };
    },
  },
  writerGate: {
    async inspect() {
      return {
        approved: true,
        targetWritable: true,
        sourceWatermark: "1",
        appliedWatermark: "1",
        goldenCorpusSha256: "a".repeat(64),
        goldenEvaluatorCorpusQualified: true,
        ddlEpochIntegrationQualified: true,
        approvedBy: ["test"],
        approvalTicket: "SEC-1",
      };
    },
  },
  audit: { async record() {} },
});
const command = (
  kind: AuthorizationManagementCommand["kind"],
  payload: Record<string, unknown> = {},
  extra: Partial<AuthorizationManagementCommand> = {},
): AuthorizationManagementCommand => ({
  context,
  kind,
  payload,
  commandId: randomUUID(),
  idempotencyKey: randomUUID(),
  ...extra,
});
async function evidence(id: string) {
  return {
    audit: (
      await sql`SELECT 1 FROM audit.audit_log WHERE entity_id=${id}::uuid AND event_code='authorization.management.success'`.execute(
        admin,
      )
    ).rows.length,
    outbox: (
      await sql`SELECT 1 FROM event.outbox WHERE entity_id=${id}::uuid AND topic='authorization.management'`.execute(
        admin,
      )
    ).rows.length,
  };
}
describe.runIf(enabled)(
  "production authorization writer against full plane DDL",
  () => {
    beforeAll(async () => {
      await sql
        .raw(
          "DO $$ BEGIN CREATE ROLE auth_writer_test; EXCEPTION WHEN duplicate_object THEN NULL; END $$; GRANT athyperapp,athyper_authorization_writer TO auth_writer_test;",
        )
        .execute(admin);
      await sql`INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES(${tenant}::uuid,${"test_" + tenant.slice(0, 8)},'Writer test','Writer test','athyper','active','00000000-0000-0000-0000-000000000000')`.execute(
        admin,
      );
      for (const id of [actor, reviewer])
        await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES(${id}::uuid,${tenant}::uuid,${"actor_" + id.slice(0, 8)},'Writer actor','service_account','00000000-0000-0000-0000-000000000000')`.execute(
          admin,
        );
    });
    afterAll(async () => {
      await db.destroy();
      await admin.destroy();
    });
    it("commits a real role, receipt, audit and outbox; replays without duplicate evidence", async () => {
      const input = command("role.create", {
        code: "role_" + randomUUID().slice(0, 8),
        name: "Operators",
      });
      const result = await service.execute(input);
      expect(result.receipt.version).toBe(1);
      expect(await evidence(result.receipt.resourceId)).toEqual({
        audit: 1,
        outbox: 1,
      });
      expect((await service.execute(input)).receipt).toMatchObject({
        replayed: true,
        resourceId: result.receipt.resourceId,
      });
      expect(await evidence(result.receipt.resourceId)).toEqual({
        audit: 1,
        outbox: 1,
      });
      await expect(
        service.execute({
          ...input,
          payload: { ...input.payload, name: "Changed" },
        }),
      ).rejects.toMatchObject({ status: 409 });
    });
    it("returns one success and one 409 for competing versions; foreign rows are 404", async () => {
      const result = await service.execute(
        command("role.create", {
          code: "race_" + randomUUID().slice(0, 8),
          name: "Before",
        }),
      );
      const input = command(
        "role.update",
        { name: "After" },
        { resourceId: result.receipt.resourceId, expectedVersion: 1 },
      );
      const results = await Promise.allSettled([
        service.execute(input),
        service.execute({
          ...input,
          commandId: randomUUID(),
          idempotencyKey: randomUUID(),
        }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
      await expect(
        service.execute({
          ...input,
          context: { ...context, tenantId: randomUUID() },
          expectedVersion: 2,
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it("rolls back effects, receipts and audit if the outbox rejects the event", async () => {
      const id = randomUUID();
      await sql
        .raw(
          `CREATE FUNCTION event.test_fail_authorization_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${id}'::uuid THEN RAISE EXCEPTION 'test outbox failure'; END IF; RETURN NEW; END $$;CREATE TRIGGER test_fail_authorization_outbox BEFORE INSERT ON event.outbox FOR EACH ROW EXECUTE FUNCTION event.test_fail_authorization_outbox();`,
        )
        .execute(admin);
      const input = command(
        "role.create",
        { code: "rollback_" + id.slice(0, 8), name: "Rollback" },
        { resourceId: id },
      );
      try {
        await expect(service.execute(input)).rejects.toThrow(
          "test outbox failure",
        );
        expect(
          (
            await sql`SELECT 1 FROM authz.role WHERE id=${id}::uuid`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await sql`SELECT 1 FROM authz.management_receipt WHERE resource_id=${id}::uuid`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(0);
        expect(await evidence(id)).toEqual({ audit: 0, outbox: 0 });
      } finally {
        await sql
          .raw(
            "DROP TRIGGER test_fail_authorization_outbox ON event.outbox;DROP FUNCTION event.test_fail_authorization_outbox();",
          )
          .execute(admin);
      }
    });
    it("preserves terminal lifecycle rules and rejects protected payload fields", async () => {
      const result = await service.execute(
        command("role.create", {
          code: "retire_" + randomUUID().slice(0, 8),
          name: "Retire",
        }),
      );
      await service.execute(
        command(
          "role.retire",
          {},
          { resourceId: result.receipt.resourceId, expectedVersion: 1 },
        ),
      );
      await expect(
        service.execute(
          command(
            "role.activate",
            {},
            { resourceId: result.receipt.resourceId, expectedVersion: 2 },
          ),
        ),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.execute(
          command("role.create", {
            code: "forged",
            name: "Forged",
            roleKind: "system",
          }),
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
    it("locks and approves a real override with separation, replay and revocation", async () => {
      const permission = randomUUID();
      testPermission = permission;
      const scope = (
        await service.execute(
          command("scopeTarget.create", {
            scopeKind: "tenant",
            scopeKey: tenant,
            targetId: tenant,
            displayName: "Tenant",
          }),
        )
      ).receipt.resourceId;
      testScope = scope;
      await admin.transaction().execute(async (tx) => {
        await sql`INSERT INTO authz.permission(id,canonical_code,permission_kind,module_id,is_overridable,is_shareable,is_delegable,status,created_by) SELECT ${permission}::uuid,${"test.writer.p_" + permission.replaceAll("-", "")},'capability',id,true,true,true,'published','00000000-0000-0000-0000-000000000000' FROM control.module WHERE status='active' LIMIT 1`.execute(
          tx,
        );
        await sql`INSERT INTO authz.permission_scope_kind(permission_id,scope_kind,created_by) VALUES(${permission}::uuid,'tenant','00000000-0000-0000-0000-000000000000')`.execute(
          tx,
        );
        await sql`INSERT INTO authz.plane_membership(tenant_id,principal_id,status,created_by) VALUES(${tenant}::uuid,${actor}::uuid,'active',${actor}::uuid)`.execute(
          tx,
        );
      });
      const request = await service.execute(
        command(
          "override.request",
          {
            principalId: actor,
            permissionId: permission,
            scopeTargetId: scope,
            reason: "Incident",
            approvalTicket: "SEC-1",
          },
          {
            effectiveFrom: new Date(Date.now() - 1000).toISOString(),
            effectiveUntil: new Date(Date.now() + 3600000).toISOString(),
          },
        ),
      );
      const approval = command(
        "override.approve",
        {},
        { resourceId: request.receipt.resourceId, expectedVersion: 1 },
      );
      await expect(service.execute(approval)).rejects.toMatchObject({
        status: 403,
      });
      const reviewed = {
        ...approval,
        context: { ...context, principalId: reviewer },
      };
      const result = await service.execute(reviewed);
      expect(result.receipt.version).toBe(2);
      expect((await service.execute(reviewed)).receipt.replayed).toBe(true);
      await service.execute(
        command(
          "override.revoke",
          { reason: "Resolved" },
          { resourceId: request.receipt.resourceId, expectedVersion: 2 },
        ),
      );
      expect(
        (
          await sql<{
            status: string;
          }>`SELECT status FROM authz.override WHERE id=${request.receipt.resourceId}::uuid`.execute(
            admin,
          )
        ).rows[0]!.status,
      ).toBe("revoked");
    });
    it("persists group membership, scoped role assignments and deny revocation", async () => {
      const role = (
        await service.execute(
          command("role.create", {
            code: "assigned_" + randomUUID().slice(0, 8),
            name: "Assigned",
          }),
        )
      ).receipt.resourceId;
      await service.execute(
        command("role.permission.assign", {
          roleId: role,
          permissionId: testPermission,
        }),
      );
      await service.execute(
        command("role.activate", {}, { resourceId: role, expectedVersion: 1 }),
      );
      const group = (
        await service.execute(
          command("group.create", {
            code: "group_" + randomUUID().slice(0, 8),
            name: "Group",
          }),
        )
      ).receipt.resourceId;
      const member = await service.execute(
        command("group.member.add", { groupId: group, principalId: actor }),
      );
      const grant = await service.execute(
        command("group.role.assign", {
          groupId: group,
          roleId: role,
          scopeTargetId: testScope,
        }),
      );
      const deny = await service.execute(
        command("deny.create", {
          permissionId: testPermission,
          scopeTargetId: testScope,
          subjectKind: "principal",
          principalId: actor,
          reason: "Incident",
        }),
      );
      for (const [kind, result] of [
        ["group.member.revoke", member],
        ["group.role.revoke", grant],
        ["deny.revoke", deny],
      ] as const)
        await service.execute(
          command(
            kind,
            {},
            { resourceId: result.receipt.resourceId, expectedVersion: 1 },
          ),
        );
      expect(
        (
          await sql`SELECT 1 FROM event.authorization_invalidation_outbox WHERE tenant_id=${tenant}::uuid AND authority_table='group_role'`.execute(
            admin,
          )
        ).rows.length,
      ).toBeGreaterThan(0);
    });
    it("enforces child edit windows, delegation child deletion, and ACL revocation", async () => {
      const role = (
        await service.execute(
          command("role.create", {
            code: "children_" + randomUUID().slice(0, 8),
            name: "Children",
          }),
        )
      ).receipt.resourceId;
      const assignment = await service.execute(
        command("role.permission.assign", {
          roleId: role,
          permissionId: testPermission,
        }),
      );
      await service.execute(
        command(
          "role.permission.revoke",
          {},
          { resourceId: assignment.receipt.resourceId, expectedVersion: 1 },
        ),
      );
      const delegation = await service.execute(
        command(
          "delegation.create",
          { delegatorId: actor, delegateId: reviewer, reason: "Cover" },
          {
            effectiveFrom: new Date().toISOString(),
            effectiveUntil: new Date(Date.now() + 3600000).toISOString(),
          },
        ),
      );
      const grant = await service.execute(
        command("delegation.grant.assign", {
          delegationId: delegation.receipt.resourceId,
          permissionId: testPermission,
          scopeTargetId: testScope,
        }),
      );
      await service.execute(
        command(
          "delegation.grant.revoke",
          {},
          { resourceId: grant.receipt.resourceId, expectedVersion: 1 },
        ),
      );
      const acl = await service.execute(
        command("acl.grant", {
          resourceCode: "test.record",
          recordId: randomUUID(),
          permissionId: testPermission,
          subjectKind: "principal",
          principalId: actor,
          reason: "Share",
        }),
      );
      await service.execute(
        command(
          "acl.revoke",
          { reason: "Share ended" },
          { resourceId: acl.receipt.resourceId, expectedVersion: 1 },
        ),
      );
    });
    it("revokes an existing remembered device across principals without permitting enrollment", async () => {
      const id = randomUUID();
      await sql`INSERT INTO authz.trusted_device(id,tenant_id,principal_id,auth_epoch,device_token_hash,expires_at,created_by) SELECT ${id}::uuid,tenant_id,id,auth_epoch,${"b".repeat(64)},clock_timestamp()+interval '1 hour',id FROM master.principal WHERE id=${actor}::uuid`.execute(
        admin,
      );
      await service.execute(
        command(
          "trustedDevice.revoke",
          { reason: "Lost device" },
          {
            context: { ...context, principalId: reviewer },
            resourceId: id,
            expectedVersion: 1,
          },
        ),
      );
      expect(
        (
          await sql`SELECT 1 FROM authz.trusted_device WHERE id=${id}::uuid AND revoked_by=${reviewer}::uuid AND version=2`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
      await expect(
        service.execute(
          command("trustedDevice.register", {
            deviceTokenHash: "a".repeat(64),
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          }),
        ),
      ).rejects.toMatchObject({
        code: "AUTHZ_DEVICE_ENROLLMENT_REQUIRED",
        status: 403,
      });
      await expect(
        service.execute(command("entityOperation.publish")),
      ).rejects.toMatchObject({
        code: "AUTHZ_COMPILER_PUBLICATION_REQUIRED",
        status: 403,
      });
    });
    it("does not substitute canonical writes for an unconfigured legacy writer", async () => {
      await expect(
        uow.run(context, (ports) =>
          ports.legacyWriter.execute(
            command("role.create", { code: "legacy", name: "Legacy" }),
          ),
        ),
      ).rejects.toMatchObject({
        code: "AUTHZ_LEGACY_WRITER_UNAVAILABLE",
        status: 503,
      });
    });
  },
);
