import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type {
  AuthorizationManagementCommand,
  AuthorizationManagementMode,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { KyselyAuthorizationUnitOfWork } from "./kysely-authorization-unit-of-work.js";
import { createAuthorizationManagementService } from "./authorization-management-service.js";

const url = process.env["ATHYPER_CYCLE_REVIEW_DATABASE_URL"];
const enabled =
  process.env["ATHYPER_CYCLE_REVIEW_DB_TESTS"] === "true" && Boolean(url);
const connect = (app = false) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url ?? "postgres://disabled",
        ...(app
          ? { options: "-c role=auth_review_app -c app.database_plane=mesh" }
          : {}),
      }),
    }),
  });
const admin = connect(),
  db = connect(true);
const context = {
  tenantId: "00000000-0000-4000-8000-000000000001",
  principalId: "00000000-0000-4000-8000-000000000002",
  planeKey: "mesh",
} as VerifiedRequestContext;
const command: AuthorizationManagementCommand = {
  context,
  kind: "role.create",
  commandId: "role",
  idempotencyKey: "role",
  payload: {},
};
function harness(
  mode: AuthorizationManagementMode,
  failAudit = false,
  failShadow = false,
) {
  const unitOfWork = new KyselyAuthorizationUnitOfWork(
    { mesh: db },
    (tx, ctx) => {
      const writer = {
        async readOverrideRequest(
          _context: VerifiedRequestContext,
          id: string,
        ) {
          const row = (
            await sql<{
              requested_by: string;
              status: string;
            }>`SELECT requested_by,status FROM auth_review.requests WHERE tenant_id=${ctx.tenantId}::uuid AND id=${id} FOR UPDATE`.execute(
              tx,
            )
          ).rows[0];
          return row
            ? { requestedBy: row.requested_by, status: row.status }
            : undefined;
        },
        async execute(input: AuthorizationManagementCommand) {
          if (input.kind === "override.approve")
            await sql`UPDATE auth_review.requests SET status='approved' WHERE tenant_id=${ctx.tenantId}::uuid AND id=${input.resourceId}`.execute(
              tx,
            );
          await sql`INSERT INTO auth_review.effects(tenant_id,command_id) VALUES(${ctx.tenantId}::uuid,${input.commandId})`.execute(
            tx,
          );
          return {
            commandId: input.commandId,
            resourceId: "role",
            version: 1,
            replayed: false,
          };
        },
      };
      return {
        legacyWriter: writer,
        repositories: {
          forExactPlane: () => ({
            planeKey: "mesh",
            readOverrideRequest: writer.readOverrideRequest,
            apply: writer.execute,
            async preview() {
              if (failShadow) await sql`SELECT 1/0`.execute(tx);
              return { accepted: true, normalizedHash: "a".repeat(64) };
            },
          }),
        },
        audit: {
          async record(event) {
            await sql`INSERT INTO auth_review.evidence(tenant_id,command_id) VALUES(${ctx.tenantId}::uuid,${event.commandId})`.execute(
              tx,
            );
            if (failAudit) throw new Error("audit failed");
          },
        },
      };
    },
  );
  const rejected: string[] = [];
  const service = createAuthorizationManagementService({
    unitOfWork,
    authorizer: {
      async authorize() {
        return { allowed: true };
      },
    },
    rollout: {
      async select() {
        return { mode, revision: "test" };
      },
    },
    mutationsEnabled: true,
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
          approvedBy: ["security"],
          approvalTicket: "SEC-1",
        };
      },
    },
    audit: {
      async record(event) {
        rejected.push(event.outcome);
      },
    },
  });
  return { service, rejected, unitOfWork };
}
describe.runIf(enabled)(
  "authorization transaction governance (disposable PostgreSQL)",
  () => {
    beforeAll(async () => {
      await sql
        .raw(
          `CREATE SCHEMA auth_review; CREATE ROLE auth_review_app;
      CREATE TABLE auth_review.effects(tenant_id uuid NOT NULL,command_id text NOT NULL);
      CREATE TABLE auth_review.evidence(tenant_id uuid NOT NULL,command_id text NOT NULL);
      CREATE TABLE auth_review.requests(tenant_id uuid NOT NULL,id text PRIMARY KEY,requested_by text NOT NULL,status text NOT NULL);
      GRANT USAGE ON SCHEMA auth_review TO auth_review_app;
      GRANT SELECT,INSERT,UPDATE ON ALL TABLES IN SCHEMA auth_review TO auth_review_app;`,
        )
        .execute(admin);
      for (const table of ["effects", "evidence", "requests"])
        await sql
          .raw(
            `ALTER TABLE auth_review.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE auth_review.${table} FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_guard ON auth_review.${table} USING (tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid);`,
          )
          .execute(admin);
    });
    afterAll(async () => {
      await db.destroy();
      await admin.destroy();
    });
    it.each(["legacy", "shadow", "enforce"] as const)(
      "rolls back effects and success evidence on audit failure in %s",
      async (mode) => {
        const { service, rejected } = harness(mode, true);
        const commandId = `failure-${mode}`;
        await expect(
          service.execute({ ...command, commandId }),
        ).rejects.toThrow("audit failed");
        expect(
          (
            await sql`SELECT 1 FROM auth_review.effects WHERE command_id=${commandId}`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(0);
        expect(
          (
            await sql`SELECT 1 FROM auth_review.evidence WHERE command_id=${commandId}`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(0);
        expect(rejected).toEqual(["rejected"]);
      },
    );
    it.each(["legacy", "shadow", "enforce"] as const)(
      "commits effects with success evidence in %s",
      async (mode) => {
        const { service } = harness(mode);
        const commandId = `success-${mode}`;
        await expect(
          service.execute({ ...command, commandId }),
        ).resolves.toMatchObject({ mode });
        expect(
          (
            await sql`SELECT 1 FROM auth_review.effects e JOIN auth_review.evidence a USING(tenant_id,command_id) WHERE e.command_id=${commandId}`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(1);
      },
    );
    it("serializes competing approvals and rejects foreign and self approvals", async () => {
      await sql`INSERT INTO auth_review.requests VALUES(${context.tenantId}::uuid,'approval','another-requester','pending'),(${context.tenantId}::uuid,'self',${context.principalId},'pending')`.execute(
        admin,
      );
      const { service } = harness("enforce");
      const approval = {
        ...command,
        kind: "override.approve" as const,
        resourceId: "approval",
      };
      await expect(
        service.execute({
          ...approval,
          context: {
            ...context,
            tenantId: "00000000-0000-4000-8000-000000000009",
          },
        }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(
        service.execute({ ...approval, resourceId: "self" }),
      ).rejects.toMatchObject({ status: 403 });
      const results = await Promise.allSettled([
        service.execute({ ...approval, commandId: "approve-a" }),
        service.execute({ ...approval, commandId: "approve-b" }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { status: 409 },
      });
    });
    it("keeps a shadow SQL failure from aborting the authoritative legacy write", async () => {
      const { service } = harness("shadow", false, true);
      await expect(
        service.execute({ ...command, commandId: "shadow-sql-failure" }),
      ).resolves.toMatchObject({
        writer: "legacy",
        shadow: { accepted: false },
      });
      expect(
        (
          await sql`SELECT 1 FROM auth_review.effects e JOIN auth_review.evidence a USING(tenant_id,command_id) WHERE e.command_id='shadow-sql-failure'`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("rejects a database with a different physical plane", async () => {
      const unit = new KyselyAuthorizationUnitOfWork({ neon: db }, () => {
        throw new Error("must not bind");
      });
      await expect(
        unit.run({ ...context, planeKey: "neon" }, async () => {}),
      ).rejects.toMatchObject({ status: 503 });
    });
  },
);
