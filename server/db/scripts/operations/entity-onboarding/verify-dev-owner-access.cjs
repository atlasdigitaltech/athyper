// Rollback-only integration checks against the explicitly identified local DEV stack.
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { randomUUID, createHash } = require("node:crypto");
const { Client } = require(process.cwd() + "/server/db/node_modules/pg");
(async () => {
  const info = JSON.parse(
    execFileSync("docker", ["inspect", "athyper-dev-db-1"], {
      encoding: "utf8",
    }),
  )[0];
  if (info.Config.Labels["com.docker.compose.project"] !== "athyper-dev")
    throw Error("DEV required");
  const env = Object.fromEntries(
    info.Config.Env.map((v) => [
      v.slice(0, v.indexOf("=")),
      v.slice(v.indexOf("=") + 1),
    ]),
  );
  const password = readFileSync(
    info.Mounts.find((m) => m.Destination === env.POSTGRES_PASSWORD_FILE)
      .Source,
    "utf8",
  ).trim();
  for (const plane of ["studio", "neon", "mesh"]) {
    const client = new Client({
      host: Object.values(info.NetworkSettings.Networks)[0].IPAddress,
      database: "athyper_" + plane,
      user: env.POSTGRES_USER,
      password,
    });
    await client.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.database_plane',$1,true)", [
        plane,
      ]);
      async function qualifyMigration(name) {
        const source = readFileSync(`server/db/migrations/${name}`, "utf8");
        const ledger = (
          await client.query(
            "SELECT to_regclass('public.athyper_schema_migration_v1') IS NOT NULL AS present",
          )
        ).rows[0].present;
        const applied = ledger
          ? (
              await client.query(
                "SELECT status,sha256 FROM public.athyper_schema_migration_v1 WHERE migration_name=$1",
                [name],
              )
            ).rows[0]
          : undefined;
        if (applied) {
          if (
            applied.status !== "applied" ||
            applied.sha256 !== createHash("sha256").update(source).digest("hex")
          )
            throw Error("Migration ledger mismatch");
          return;
        }
        await client.query(
          source.replace(/^BEGIN;$/m, "").replace(/^COMMIT;$/m, ""),
        );
      }
      await qualifyMigration("20260929_entity_owner_access.sql");
      await client.query(
        readFileSync(
          "metadata/products/shared/access/principal-self-access.sql",
          "utf8",
        ),
      );
      await client.query(
        readFileSync(
          "server/db/scripts/operations/authorization/grant-dev-identity-entity-access.sql",
          "utf8",
        ),
      );
      if (plane === "studio")
        await qualifyMigration("20260929_table_entity_publication.sql");
      const tenants = (
        await client.query(
          "SELECT id FROM master.tenant WHERE status='active' ORDER BY code LIMIT 2",
        )
      ).rows;
      if (tenants.length < 2) throw Error("two tenants required");
      const tenant = tenants[0].id,
        otherTenant = tenants[1].id;
      const actors = [randomUUID(), randomUUID(), randomUUID()];
      for (let i = 0; i < actors.length; i++)
        await client.query(
          "INSERT INTO master.principal(id,tenant_id,code,name,principal_type,status,created_by) VALUES($1,$2,$3,'Entity rollback probe','user','active',$1)",
          [actors[i], i === 2 ? otherTenant : tenant, "probe." + actors[i]],
        );
      await client.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true)",
        [tenant, actors[0]],
      );
      await client.query(
        "INSERT INTO authz.plane_membership(tenant_id,principal_id,membership_kind,source_type,source_ref,status,created_by) VALUES($1,$2,'standard','seed','entity-rollback-probe','active',$2)",
        [tenant, actors[0]],
      );
      const defaults = (
        await client.query(
          "SELECT p.canonical_code FROM authz.group_member m JOIN authz.group_role g ON g.tenant_id=m.tenant_id AND g.group_id=m.group_id JOIN authz.role_permission rp ON rp.tenant_id=g.tenant_id AND rp.role_id=g.role_id JOIN authz.permission p ON p.id=rp.permission_id WHERE m.tenant_id=$1 AND m.principal_id=$2",
          [tenant, actors[0]],
        )
      ).rows.map((r) => r.canonical_code);
      if (
        defaults.length !== 5 ||
        defaults.includes("common.identity.principal.administer")
      )
        throw Error("default self grants");
      await client.query("SET LOCAL ROLE athyperapp");
      const own = await client.query(
        "SELECT id FROM master.principal WHERE id=ANY($1::uuid[])",
        [actors],
      );
      if (own.rows.length !== 1 || own.rows[0].id !== actors[0])
        throw Error("self principal isolation");
      const profile = await client.query(
        "INSERT INTO master.principal_profile(tenant_id,principal_id,given_name,created_by) VALUES($1,$2,$3,$2) RETURNING id,record_version",
        [tenant, actors[0], "First"],
      );
      if (Number(profile.rows[0].record_version) !== 1)
        throw Error("create version");
      await client.query("SAVEPOINT deny");
      try {
        await client.query(
          "INSERT INTO master.principal_profile(tenant_id,principal_id,created_by) VALUES($1,$2,$3)",
          [tenant, actors[1], actors[0]],
        );
        throw Error("cross owner insert admitted");
      } catch (e) {
        if (e.code !== "42501") throw e;
        await client.query("ROLLBACK TO SAVEPOINT deny");
      }
      await client.query(
        "SELECT set_config('app.entity_owner_access',$1,true)",
        [
          JSON.stringify({
            schema: "master",
            object: "principal_profile",
            tenantId: tenant,
            actorId: actors[0],
            operation: "create",
            admin: true,
          }),
        ],
      );
      await client.query(
        "INSERT INTO master.principal_profile(tenant_id,principal_id,created_by) VALUES($1,$2,$3)",
        [tenant, actors[1], actors[0]],
      );
      await client.query(
        "SELECT set_config('app.entity_owner_access',$1,true)",
        [
          JSON.stringify({
            schema: "master",
            object: "principal_profile",
            tenantId: tenant,
            actorId: actors[0],
            operation: "patch",
            admin: true,
          }),
        ],
      );
      const update = await client.query(
        "UPDATE master.principal_profile SET given_name=$1,updated_by=$2,record_version=record_version+1 WHERE tenant_id=$3 AND principal_id=$4 AND record_version=1 RETURNING record_version",
        ["Other", actors[0], tenant, actors[1]],
      );
      if (Number(update.rows[0]?.record_version) !== 2)
        throw Error("admin update/version");
      const conflict = await client.query(
        "UPDATE master.principal_profile SET given_name=$1,updated_by=$2 WHERE tenant_id=$3 AND principal_id=$4 AND record_version=1",
        ["Stale", actors[0], tenant, actors[1]],
      );
      if (conflict.rowCount !== 0) throw Error("stale write admitted");
      await client.query("SAVEPOINT cross_tenant");
      try {
        await client.query(
          "INSERT INTO master.principal_profile(tenant_id,principal_id,created_by) VALUES($1,$2,$3)",
          [otherTenant, actors[2], actors[0]],
        );
        throw Error("admin cross tenant admitted");
      } catch (e) {
        if (e.code !== "42501") throw e;
        await client.query("ROLLBACK TO SAVEPOINT cross_tenant");
      }
      await client.query(
        "SELECT set_config('app.entity_owner_access','{}',true)",
      );
      const after = await client.query(
        "SELECT id FROM master.principal_profile WHERE tenant_id=$1 AND principal_id=$2",
        [tenant, actors[1]],
      );
      if (after.rowCount) throw Error("admin marker reset isolation");
      console.log(
        JSON.stringify({
          plane,
          selfRead: true,
          selfCreate: true,
          otherOwnerDenied: true,
          authorizedAdminEdit: true,
          staleVersionDenied: true,
          adminReset: true,
          crossTenantAdminDenied: true,
          newUserDefaults: true,
          mode: "rolled_back",
        }),
      );
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
