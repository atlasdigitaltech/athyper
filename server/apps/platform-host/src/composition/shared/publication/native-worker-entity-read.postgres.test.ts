import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseNativeCompilationRecoveryPolicy } from "./native-compilation-recovery-policy.js";

// Actual DEV effective worker role. Read-only and rollback-only; not an approval.
it.skipIf(process.env.NATIVE_WORKER_ENTITY_READ_POSTGRES !== "1")(
  "allows only native publication relation identities and denies other actors and columns",
  () => {
    const file = process.env.NATIVE_RECOVERY_CANDIDATE;
    if (!file) throw Error("NATIVE_RECOVERY_CANDIDATE required");
    const policy = parseNativeCompilationRecoveryPolicy(
      JSON.parse(readFileSync(file, "utf8")),
    );
    const q = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          "athyper-dev-db-1",
          "sh",
          "-c",
          'exec psql -XqAt -U "$POSTGRES_USER" -d athyper_studio -v ON_ERROR_STOP=1',
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const source = JSON.parse(
      q(
        `BEGIN READ ONLY; SELECT r.action_config->'policy' FROM control.policy_rule r WHERE r.policy_definition_id='${policy.originalPolicy.id}'::uuid; ROLLBACK;`,
      ).trim(),
    );
    const ids = source.plan.members
      .map((m: { entityId: string }) => m.entityId)
      .sort();
    const stamp = `SET LOCAL ROLE athyper_worker; SELECT set_config('app.current_tenant_id','${policy.authorityTenantId}',true),set_config('app.current_principal_id','${policy.publisherPrincipalId}',true);`;
    const result = q(`BEGIN READ ONLY; ${stamp}
      SELECT jsonb_build_object('role',current_user,'ids',(SELECT jsonb_agg(id ORDER BY id) FROM metadata.entity),
        'otherColumn',has_column_privilege(current_user,'metadata.entity','created_by','SELECT'),
        'update',has_table_privilege(current_user,'metadata.entity','UPDATE'),
        'insert',has_table_privilege(current_user,'metadata.entity','INSERT'));
      SELECT set_config('app.current_principal_id','00000000-0000-4000-8000-000000000001',true);
      SELECT jsonb_build_object('unauthorizedCount',(SELECT count(*) FROM metadata.entity)); ROLLBACK;`);
    const rows = result
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
    expect(rows).toEqual([
      {
        role: "athyper_worker",
        ids,
        otherColumn: false,
        update: false,
        insert: false,
      },
      { unauthorizedCount: 0 },
    ]);
    expect(() =>
      q(
        `BEGIN READ ONLY; ${stamp} SELECT created_by FROM metadata.entity; ROLLBACK;`,
      ),
    ).toThrow(/permission denied/);
    const denied = q(
      `BEGIN READ ONLY; ${stamp} SELECT set_config('app.current_tenant_id','00000000-0000-4000-8000-000000000002',true); SELECT jsonb_build_object('count',(SELECT count(*) FROM metadata.entity)); ROLLBACK;`,
    );
    expect(
      JSON.parse(denied.split("\n").find((line) => line.startsWith("{"))!),
    ).toEqual({ count: 0 });
  },
  30000,
);
