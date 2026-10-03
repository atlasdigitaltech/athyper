import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import { createControlProductReview } from "./product-review.js";

// Explicit rollback-only DEV qualification. Never creates durable human evidence.
it.skipIf(process.env.PRODUCT_REVIEW_POSTGRES !== "1")(
  "qualifies native product adoption/review under the real non-bypass control role, with rollback",
  async () => {
    const c = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    if (
      !c.State.Running ||
      c.Config.Labels["com.docker.compose.project"] !== "athyper-dev"
    )
      throw Error("Running DEV required");
    const env = Object.fromEntries(
      c.Config.Env.map((x: string) => [
        x.slice(0, x.indexOf("=")),
        x.slice(x.indexOf("=") + 1),
      ]),
    );
    const secret = c.Mounts.find(
      (m: { Destination: string }) =>
        m.Destination === env.POSTGRES_PASSWORD_FILE,
    )?.Source;
    if (!secret?.includes("/.athyper/instances/dev/secrets/"))
      throw Error("DEV secret required");
    const db = new Kysely<Record<string, never>>({
      dialect: new PostgresDialect({
        pool: new Pool({
          host: (
            Object.values(c.NetworkSettings.Networks)[0] as {
              IPAddress: string;
            }
          ).IPAddress,
          user: env.POSTGRES_USER,
          password: readFileSync(secret, "utf8").trim(),
          database: "athyper_studio",
          max: 1,
        }),
      }),
    });
    const rollback = new Error("intentional rollback");
    try {
      await db.transaction().execute(async (tx) => {
        await sql
          .raw(
            readFileSync(
              new URL(
                "../../../../../db/ddl/planes/studio/metadata/22_product_human_review.sql",
                import.meta.url,
              ),
              "utf8",
            ),
          )
          .execute(tx);
        const cs = (
          await sql<{
            id: string;
          }>`SELECT c.id FROM metadata.entity_change_set c JOIN metadata.entity e ON e.id=c.entity_id WHERE e.entity_code='address' AND e.tenant_id IS NULL AND c.status='draft' ORDER BY c.created_at DESC LIMIT 1`.execute(
            tx,
          )
        ).rows[0];
        if (!cs) throw Error("DEV Address draft required");
        const actors = (
          await sql<{
            id: string;
            tenant_id: string;
            auth_epoch: number;
            code: string;
          }>`SELECT id,tenant_id,auth_epoch,code FROM master.principal WHERE code IN ('platform.admin','platform.owner') AND principal_type='user' AND status='active'`.execute(
            tx,
          )
        ).rows;
        const context = (code: string): VerifiedRequestContext => {
          const a = actors.find((a) => a.code === code)!;
          const allowed =
            code === "platform.admin"
              ? [
                  "studio.metadata.contract.view",
                  "studio.metadata.contract.edit",
                  "studio.metadata.contract.submit",
                ]
              : [
                  "studio.metadata.contract.view",
                  "studio.metadata.contract.review",
                ];
          return {
            planeKey: "studio",
            realmKey: "platform-control",
            tenantId: a.tenant_id,
            principalId: a.id,
            authEpoch: a.auth_epoch,
            profileHash: "test",
            requestId: randomUUID(),
            assurance: "elevated",
            permissions: {
              planeKey: "studio",
              tenantId: a.tenant_id,
              principalId: a.id,
              principalFingerprint: "test",
              profileHash: "test",
              schemaHash: "test",
              resolvedAt: Date.now(),
              allowed,
              denied: [],
              planLocked: [],
              planeExcluded: [],
              entries: [],
              authorizationScopes: [],
              requirements: allowed.map((permissionCode) => ({
                permissionCode,
                moduleId: "test",
                riskTier: "high",
                requiresMfa: true,
                requiresSod: permissionCode.endsWith(".review"),
                entitled: true,
              })),
            },
          };
        };
        const admin = context("platform.admin"),
          owner = context("platform.owner");
        const authority = {
          tenantId: admin.tenantId,
          realmKey: "platform-control",
          issuer: "https://iam.dev.athyper.test/realms/platform-control",
          audience: "athyper-platform-control-api",
        };
        const bound = new Proxy(tx, {
          get(target, key) {
            if (key === "transaction")
              return () => ({
                setIsolationLevel: () => ({
                  execute: (fn: (db: typeof tx) => unknown) => fn(tx),
                }),
              });
            const value = Reflect.get(target, key);
            return typeof value === "function" ? value.bind(target) : value;
          },
        });
        const audit: AuditRecorder<Kysely<Record<string, never>>> = {
          async record(event, transaction) {
            const id = randomUUID();
            await sql`SELECT audit.append_event(p_event_code:=${event.eventCode},p_operation:='execute'::audit.operation_d,p_entity_type:=${event.entityType!},p_entity_id:=${event.entityId!}::uuid,p_outcome:='success'::audit.outcome_d,p_severity:='critical'::audit.event_severity_d,p_context:=${JSON.stringify(event.metadata)}::jsonb)`.execute(
              transaction!,
            );
            return { ...event, id, occurredAt: new Date().toISOString() };
          },
        };
        await sql`SET LOCAL ROLE athyper_control_api`.execute(tx);
        const role = (
          await sql<{
            safe: boolean;
          }>`SELECT NOT rolsuper AND NOT rolbypassrls safe FROM pg_roles WHERE rolname=current_user`.execute(
            tx,
          )
        ).rows[0];
        expect(role?.safe).toBe(true);
        const service = createControlProductReview({
          database: bound,
          authority,
          audit,
        });
        await expect(
          service.inspect({ ...admin, realmKey: "athyper" }, cs.id),
        ).rejects.toThrow();
        await expect(
          service.inspect({ ...admin, assurance: "standard" }, cs.id),
        ).rejects.toThrow();
        const source = (await service.inspect(admin, cs.id)) as {
          changeSet: { revision: number; createdBy: string };
          contractHash: string;
        };
        const command = {
          requestId: randomUUID(),
          expectedRevision: source.changeSet.revision,
          expectedContractHash: source.contractHash,
        };
        await service.execute(admin, cs.id, "adopt", command);
        expect(
          await service.execute(admin, cs.id, "adopt", command),
        ).toMatchObject({ action: "adopt" });
        const submitted = (await service.execute(admin, cs.id, "submit", {
          ...command,
          requestId: randomUUID(),
        })) as { revision: number };
        await expect(
          service.execute(admin, cs.id, "approve", {
            ...command,
            requestId: randomUUID(),
            expectedRevision: submitted.revision,
          }),
        ).rejects.toThrow();
        const approvalCommand = {
          ...command,
          requestId: randomUUID(),
          expectedRevision: submitted.revision,
        };
        const approved = (await service.execute(
          owner,
          cs.id,
          "approve",
          approvalCommand,
        )) as { status: string };
        expect(approved.status).toBe("approved");
        expect(await service.inspect(owner, cs.id)).toMatchObject({
          changeSet: { status: "approved" },
        });
        expect(
          await service.execute(owner, cs.id, "approve", approvalCommand),
        ).toEqual(approved);
        const retained = (
          await sql<{
            created_by: string;
            submitted_by: string;
            approved_by: string;
          }>`SELECT created_by,submitted_by,approved_by FROM metadata.entity_change_set WHERE id=${cs.id}::uuid`.execute(
            tx,
          )
        ).rows[0]!;
        expect(retained.created_by).toBe(source.changeSet.createdBy);
        expect(retained.submitted_by).toBe(admin.principalId);
        expect(retained.approved_by).toBe(owner.principalId);
        const rights = (
          await sql<{
            graph_write: boolean;
            publish_write: boolean;
            receipt_delete: boolean;
          }>`SELECT has_table_privilege(current_user,'metadata.entity_field','UPDATE') graph_write,has_table_privilege(current_user,'metadata.entity_release','INSERT') publish_write,has_table_privilege(current_user,'metadata.entity_product_review_receipt','DELETE') receipt_delete`.execute(
            tx,
          )
        ).rows[0];
        expect(rights).toEqual({
          graph_write: false,
          publish_write: false,
          receipt_delete: false,
        });
        throw rollback;
      });
    } catch (e) {
      if (e !== rollback) throw e;
    } finally {
      await db.destroy();
    }
  },
  30000,
);
