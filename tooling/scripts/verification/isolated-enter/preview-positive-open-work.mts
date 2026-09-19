/** Production repository/SQL engineering rehearsal. All fixtures and migration
 * changes roll back; synthetic actors never represent human publication review. */
import fs from "node:fs";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createRequire } from "node:module";

if (!process.argv.includes("--inside")) {
  const container = JSON.parse(
    cp.execFileSync("docker", ["inspect", "athyper-bp-enter-db"], {
      encoding: "utf8",
    }),
  )[0];
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [
    "athyper-bp-enter-isolated",
  ]);
  const password = container.Config.Env.find((value: string) =>
    value.startsWith("POSTGRES_PASSWORD="),
  )?.slice("POSTGRES_PASSWORD=".length);
  assert.ok(password);
  const result = cp.spawnSync(
    "docker",
    [
      "exec",
      "-i",
      "-w",
      process.cwd(),
      "athyper-bp-dependency-studio-api",
      "node",
      "--import",
      "tsx",
      import.meta.filename,
      "--inside",
    ],
    {
      input: JSON.stringify({ password }),
      encoding: "utf8",
      maxBuffer: 2_000_000,
    },
  );
  process.stdout.write(result.stdout);
  if (result.status) {
    process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
} else {
  const { password } = JSON.parse(fs.readFileSync(0, "utf8"));
  const require = createRequire(
    new URL(
      "../../../../server/packages/services/master-data/package.json",
      import.meta.url,
    ),
  );
  const { Pool } = require("pg"),
    { Kysely, PostgresDialect, sql } = require("kysely");
  const { KyselyBusinessPartnerCaseRepository } =
    await import("../../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.js");
  const { readBusinessPartner360ExplainabilitySection: read } =
    await import("../../../../server/packages/services/master-data/src/kysely-business-partner-360-explainability.js");
  const db = new Kysely({
    dialect: new PostgresDialect({
      pool: new Pool({
        host: "athyper-bp-enter-db",
        user: "postgres",
        password,
        database: "athyper_neon",
        max: 1,
      }),
    }),
  });
  const report: any = {
    createdAt: new Date().toISOString(),
    localPreview: true,
    authenticatedQualification: false,
    grantChanges: [],
    checks: [],
    rolledBack: false,
  };
  const rollback = new Error("EXPECTED_PREVIEW_ROLLBACK");
  try {
    await db.transaction().execute(async (tx: any) => {
      const tenant = "44444444-4444-4444-8444-444444444444",
        bp = "01a092d1-8242-7948-9ce9-6f19c38c4b27",
        org = "a478f9c0-8226-5d22-9599-b8fb27a45180";
      const actor = (
        await sql`SELECT id FROM master.principal WHERE tenant_id=${tenant}::uuid AND code='seed.three-plane-provisioner'`.execute(
          tx,
        )
      ).rows[0].id;
      await sql`SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(
        tx,
      );
      const prior = (
        await sql`SELECT form_template_release_id,form_template_release_no,form_template_hash FROM document.entity_case WHERE id='946f02c2-c4c9-4dd8-99ba-10dbe99354d5'`.execute(
          tx,
        )
      ).rows[0];
      const repository = new KyselyBusinessPartnerCaseRepository(),
        ids = [];
      for (let i = 0; i < 2; i++) {
        const command = {
          kind: "deactivate",
          source: { kind: "manual" },
          targetBusinessPartnerId: bp,
          operatingOrganizationId: org,
          proposedPayload: { displayName: "Synthetic open-work preview" },
          idempotencyKey: "open-work-preview-" + randomUUID(),
        };
        const row = await repository.create(
          {
            tenantId: tenant,
            requestNo:
              "BPR-PREVIEW-" + randomUUID().replaceAll("-", "").toUpperCase(),
            command,
            schema: {
              code: "business_partner.onboarding",
              version: Number(prior.form_template_release_no),
              hash: prior.form_template_hash,
              releaseId: prior.form_template_release_id,
            },
            createdBy: actor,
          } as never,
          tx,
        );
        ids.push(row.id);
        assert.equal(row.status, "draft");
      }
      report.fixtureIds = ids;
      report.checks.push(
        "Two ordinary drafts created through production repository and governed SQL command; no fabricated command evidence",
      );
      const query = {
        tenantId: tenant,
        businessPartnerId: bp,
        sectionCode: "requests",
        limit: 26,
        cursor: { snapshotAt: new Date().toISOString() },
      };
      for (const allowed of [[ids[0]], ids, []]) {
        const result = await read(
          {
            ...query,
            authorizeCase: async (id: string) => allowed.includes(id),
          } as never,
          tx,
        );
        assert.equal(result.summary?.active, allowed.length);
        assert.deepEqual(
          result.items.map((item: any) => item.id).sort(),
          [...allowed].sort(),
        );
        report.checks.push({
          visibleDrafts: allowed.length,
          activeCount: result.summary?.active,
          rows: result.items.length,
        });
      }
      let calls = 0;
      const candidateCount = Number(
        (
          await sql`SELECT count(*) n FROM document.entity_case WHERE tenant_id=${tenant}::uuid AND entity_code='master.business_partner' AND target_entity_id=${bp}::uuid`.execute(
            tx,
          )
        ).rows[0].n,
      );
      await assert.rejects(
        read(
          {
            ...query,
            authorizeCase: async (id: string) => {
              calls++;
              return calls <= candidateCount && id === ids[0];
            },
          } as never,
          tx,
        ),
        (e: any) => e.code === "BP_CHILD_AUTHORIZATION_CHANGED",
      );
      report.checks.push("Revocation during aggregation rejects projection");
      throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
    report.rolledBack = true;
  } finally {
    await db.destroy();
  }
  assert(report.rolledBack);
  report.passed = true;
  report.authorizationBoundary =
    "Injected preview child decisions qualify SQL filtering only; no human execution authority is claimed.";
  fs.writeFileSync(
    "governance/policy/reports/business-partner-positive-open-work-preview-20260912.dev.json",
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(report);
}
