/** User-authorized temporary DEV grants through the canonical management repository; no business outcome fixtures. */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { KyselyAuthorizationManagementRepository } from "../../../server/packages/platform/control-admin/src/kysely-authorization-management-repository.js";
const require = createRequire(
    new URL("../../../server/db/package.json", import.meta.url),
  ),
  { Pool } = require("pg"),
  { Kysely, PostgresDialect, sql } = require("kysely");
const db = new Kysely({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: execFileSync(
        "docker",
        [
          "inspect",
          "--format",
          "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
          "athyper-dev-db-1",
        ],
        { encoding: "utf8" },
      ).trim(),
      user: "postgres",
      database: "athyper_neon",
      password: readFileSync(
        `${process.env.HOME}/.athyper/instances/dev/secrets/postgres-password`,
        "utf8",
      ).trim(),
    }),
  }),
});

const tenant = "44444444-4444-4444-8444-444444444444",
  actor = "cca94907-7519-5871-8e3c-6b11aa545c93";
const path =
  "governance/policy/reports/supplier-onboarding-dev-access.dev.json";
const revoke = process.argv.includes("--revoke");
const report: any = existsSync(path)
  ? JSON.parse(readFileSync(path, "utf8"))
  : {
      at: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      boundary:
        "User-authorized DEV provisioning through canonical authorization management commands; existing scope, MFA and maker-checker rules retained",
      assignments: [],
      receipts: [],
    };
const context: any = { tenantId: tenant, principalId: actor, planeKey: "neon" };
try {
  await db.transaction().execute(async (tx: any) => {
    await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true),set_config('app.database_plane','neon',true)`.execute(
      tx,
    );
    const repository = new KyselyAuthorizationManagementRepository(tx, context);
    const command = async (
      kind: string,
      key: string,
      payload: any,
      extra: any = {},
    ) => {
      const receipt = await repository.apply({
        context,
        kind,
        commandId: `p6-dev-access:${key}`,
        idempotencyKey: `p6-dev-access:${key}`,
        payload,
        ...extra,
      });
      report.receipts.push({ kind, ...receipt });
      return receipt;
    };
    if (revoke) {
      for (const a of report.assignments) {
        const row = (
          await sql`SELECT version,status FROM authz.group_role WHERE tenant_id=${tenant}::uuid AND id=${a.resourceId}::uuid`.execute(
            tx,
          )
        ).rows[0];
        assert.ok(row);
        if (row.status === "active")
          await command(
            "group.role.revoke",
            `revoke:${a.resourceId}`,
            {},
            { resourceId: a.resourceId, expectedVersion: Number(row.version) },
          );
      }
      report.revokedAt = new Date().toISOString();
      return;
    }
    assert.ok(
      Date.parse(report.expiresAt) > Date.now(),
      "Temporary grants expired; do not extend without review",
    );
    for (const [name, principal, codes] of [
      [
        "admin",
        actor,
        [
          "neon.supplier.qualification.admin",
          "neon.relationship.business_partner.activate",
        ],
      ],
      [
        "owner",
        "645b6a55-3355-526a-9643-3900425bde47",
        ["neon.supplier.qualification.admin"],
      ],
      [
        "admin-company",
        actor,
        ["neon.relationship.bp_target.qualification_company"],
      ],
    ] as const) {
      const company = name === "admin-company",
        scope = company
          ? "01a0953c-dfa1-7cf4-af43-5da91bed7d29"
          : "bd7f1a62-5c32-5a9b-a984-c5adc3370a24",
        propagation = company ? "exact" : "subtree";
      const permissions = [];
      for (const code of codes) {
        const p = (
          await sql`SELECT id,authz.fn_internal_permission_is_assignable_at_scope(id,${tenant}::uuid,${scope}::uuid,${propagation}::authz.propagation_mode_d) AS compatible FROM authz.permission WHERE canonical_code=${code}`.execute(
            tx,
          )
        ).rows[0];
        assert.equal(p?.compatible, true, code);
        permissions.push(p);
      }
      const role = await command("role.create", `${name}:role`, {
        code: `dev.p6.temporary.${name}`,
        name: `DEV P6 temporary ${name}`,
        description:
          "User-approved P6 qualification; assignments expire within 24 hours",
      });
      for (let i = 0; i < permissions.length; i++)
        await command("role.permission.assign", `${name}:permission:${i}`, {
          roleId: role.resourceId,
          permissionId: permissions[i].id,
        });
      await command(
        "role.activate",
        `${name}:activate`,
        {},
        { resourceId: role.resourceId, expectedVersion: role.version },
      );
      const group = await command("group.create", `${name}:group`, {
        code: `dev.p6.temporary.${name}`,
        name: `DEV P6 temporary ${name}`,
      });
      await command(
        "group.member.add",
        `${name}:member`,
        { groupId: group.resourceId, principalId: principal },
        { effectiveUntil: report.expiresAt },
      );
      const assignment = await command(
        "group.role.assign",
        `${name}:assignment`,
        {
          groupId: group.resourceId,
          roleId: role.resourceId,
          scopeTargetId: scope,
          propagationMode: propagation,
        },
        { effectiveUntil: report.expiresAt },
      );
      if (
        !report.assignments.some(
          (a: any) => a.resourceId === assignment.resourceId,
        )
      )
        report.assignments.push({
          ...assignment,
          name,
          principal,
          permissions: codes,
          scope,
          propagation,
        });
    }
    report.applied = true;
  });
  writeFileSync(path, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      applied: report.applied,
      revoked: !!report.revokedAt,
      assignments: report.assignments.length,
    }),
  );
} finally {
  await db.destroy();
}
