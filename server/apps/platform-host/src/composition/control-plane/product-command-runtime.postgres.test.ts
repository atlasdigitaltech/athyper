import { execFileSync } from "node:child_process";
import { readFileSync, lstatSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createControlProductCommandRuntime } from "./product-command-runtime.js";
import { createControlProductCommandGovernance } from "./product-command-governance.js";

// Opt-in installed-role qualification, not human authentication or enrollment.
// The audit probe rolls back; no admission is issued and no draft is changed.
it.skipIf(process.env.PRODUCT_COMMAND_DEV_POSTGRES !== "1")(
  "qualifies installed runtime roles, real IAM lookup, denied direct writes and transactional audit",
  async () => {
    const container = JSON.parse(
      execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
        encoding: "utf8",
      }),
    )[0];
    expect(container.Config.Labels["com.docker.compose.project"]).toBe(
      "athyper-dev",
    );
    expect(container.State.Running).toBe(true);
    const ip = (
      Object.values(container.NetworkSettings.Networks)[0] as {
        IPAddress: string;
      }
    ).IPAddress;
    const pools: Kysely<Record<string, never>>[] = [];
    function connect(file: string) {
      const path = join(homedir(), ".athyper/instances/dev/secrets", file);
      expect(lstatSync(path).mode & 0o077).toBe(0);
      const url = new URL(readFileSync(path, "utf8").trim());
      expect(url.hostname).toBe("db");
      expect(url.pathname).toBe("/athyper_studio");
      url.hostname = ip;
      const db = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: new Pool({ connectionString: url.toString(), max: 1 }),
        }),
      });
      pools.push(db);
      return db;
    }
    const governanceDatabase = connect("control-api/database-url"),
      issuerDatabase = connect("product-command/issuer-database-url"),
      commandDatabase = connect("product-command/application-database-url");
    try {
      const authority = {
        tenantId: "11111111-1111-4111-8111-111111111111",
        realmKey: "platform-control",
        issuer: "https://iam.dev.athyper.test/realms/platform-control",
        audience: "athyper-platform-control-api",
      };
      const runtime = await createControlProductCommandRuntime({
        governanceDatabase,
        issuerDatabase,
        commandDatabase,
        applicationLogin: "athyper_dev_product_command",
        authority,
        labels: {
          supportedLocales: ["en"],
          maxCommands: 100,
          maxBatchBytes: 65536,
        },
        audit: {
          async record() {
            throw Error("NOT_CALLED");
          },
        },
      });
      expect(runtime.host).toBeDefined();
      expect(
        (
          await sql`SELECT id FROM metadata.entity_change_set`.execute(
            commandDatabase,
          )
        ).rows,
      ).toEqual([]);
      await expect(
        sql`UPDATE metadata.entity_change_set SET source_kind='product' WHERE false`.execute(
          commandDatabase,
        ),
      ).rejects.toThrow();
      await expect(
        sql`SELECT entity_command_private.enter(${"0".repeat(64)},${"0".repeat(64)})`.execute(
          commandDatabase,
        ),
      ).rejects.toThrow("ADMISSION_DENIED");
      // Resolve actual human identity/grants under the governance connection.
      // Synthetic request context below does not attest a fresh signed login.
      const actor = JSON.parse(
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            "athyper-dev-db-1",
            "sh",
            "-c",
            'psql -X -qAt -U "${POSTGRES_USER:-postgres}" -d athyper_studio -v ON_ERROR_STOP=1',
          ],
          {
            input:
              "BEGIN READ ONLY; SELECT jsonb_build_object('id',id,'auth_epoch',auth_epoch) FROM master.principal WHERE code='platform.admin' AND tenant_id='11111111-1111-4111-8111-111111111111' AND principal_type='user' AND status='active'; COMMIT;",
            encoding: "utf8",
            stdio: ["pipe", "pipe", "pipe"],
          },
        ).trim(),
      );
      expect(actor).toBeDefined();
      const root = (
        await sql<{
          id: string;
        }>`SELECT id FROM metadata.entity_change_set WHERE tenant_id IS NULL AND status='draft' ORDER BY id LIMIT 1`.execute(
          governanceDatabase,
        )
      ).rows[0]!;
      const context = {
        planeKey: "studio",
        realmKey: authority.realmKey,
        tenantId: authority.tenantId,
        principalId: actor!.id,
        authEpoch: actor!.auth_epoch,
        assurance: "elevated",
        requestId: randomUUID(),
      } as VerifiedRequestContext;
      const governance = createControlProductCommandGovernance({
        database: governanceDatabase,
        authority,
      });
      const scope = {
        authorityTenantId: authority.tenantId,
        actorId: actor!.id,
        changeSetId: root.id,
      };
      await governance.authorize(context, scope, "a".repeat(64));
      await expect(
        governance.authorize(
          context,
          { ...scope, actorId: randomUUID() },
          "a".repeat(64),
        ),
      ).rejects.toThrow();
      const rollback = new Error("ROLLBACK_AUDIT_PROBE");
      await expect(
        commandDatabase.transaction().execute(async (tx) => {
          await sql`SELECT set_config('app.database_plane','studio',true),set_config('app.current_tenant_id',${authority.tenantId},true),set_config('app.current_principal_id',${actor!.id},true)`.execute(
            tx,
          );
          const result = await sql<{
            id: string;
          }>`SELECT audit.append_event(p_event_code:='metadata.entity.product.enrollment',p_operation:='execute'::audit.operation_d,p_entity_type:='metadata.entity_change_set',p_entity_id:=${root.id}::uuid,p_context:='{"qualification":"rollback-only; synthetic request context"}'::jsonb) AS id`.execute(
            tx,
          );
          expect(result.rows[0]?.id).toMatch(/^[a-f0-9-]{36}$/);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
    } finally {
      await Promise.all(pools.map((db) => db.destroy()));
    }
  },
);
