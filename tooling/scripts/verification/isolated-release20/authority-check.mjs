import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const tables = [
  "role",
  "role_permission",
  "group_member",
  "group_role",
  "plane_membership",
  "delegation",
  "delegation_grant",
  "permission",
  "permission_scope_kind",
  "deny_rule",
  "record_acl",
  "override",
  "scope_target",
  "principal_group",
];
export function assertAuthorityUnchanged() {
  const snapshots = {};
  for (const container of ["athyper-dev-db-1", "athyper-bp-r20-db"]) {
    const sql = tables
      .map(
        (t) =>
          `SELECT '${t}',md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text) FROM authz.${t} r`,
      )
      .join(" UNION ALL ");
    snapshots[container] = execFileSync(
      "docker",
      [
        "exec",
        container,
        "psql",
        "-X",
        "-U",
        "postgres",
        "-d",
        "athyper_neon",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  }
  return {
    sha256: createHash("sha256")
      .update(JSON.stringify(snapshots))
      .digest("hex"),
    snapshots,
  };
}
