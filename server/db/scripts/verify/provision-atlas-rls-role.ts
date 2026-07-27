#!/usr/bin/env tsx
/**
 * Provision the disposable role used by Atlas PostgreSQL RLS verification.
 *
 * This is intentionally explicit. It requires
 * ATLAS_RLS_ROLE_PROVISION_CONFIRM=I_UNDERSTAND_LOCAL_DISPOSABLE_DB and does
 * not accept a role name or grant broad privileges from the environment.
 * The role is NOLOGIN, NOSUPERUSER, NOBYPASSRLS and inherits only the normal
 * athyperapp application grants needed by the rollback-only fixtures.
 */

import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const confirmation = process.env.ATLAS_RLS_ROLE_PROVISION_CONFIRM;
const roleName = "athyperapp_test";

if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (confirmation !== "I_UNDERSTAND_LOCAL_DISPOSABLE_DB") {
  throw new Error(
    "Refusing to provision the RLS role without "
      + "ATLAS_RLS_ROLE_PROVISION_CONFIRM=I_UNDERSTAND_LOCAL_DISPOSABLE_DB",
  );
}

const sql = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
try {
  await sql.begin(async (trx) => {
    await trx.unsafe(`
      DO $provision$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${roleName}') THEN
          CREATE ROLE ${roleName}
            NOLOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            INHERIT
            NOREPLICATION
            NOBYPASSRLS;
        END IF;
      END
      $provision$;
    `);
    await trx.unsafe(
      `ALTER ROLE ${roleName} NOSUPERUSER NOCREATEDB NOCREATEROLE `
        + `INHERIT NOREPLICATION NOBYPASSRLS`,
    );
    await trx.unsafe(`GRANT athyperapp TO ${roleName}`);
    const [role] = await trx<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
      rolinherit: boolean;
      rolcanlogin: boolean;
    }[]>`
      SELECT rolname, rolsuper, rolbypassrls, rolinherit, rolcanlogin
      FROM pg_roles
      WHERE rolname = ${roleName}
    `;
    if (!role || role.rolsuper || role.rolbypassrls || !role.rolinherit || role.rolcanlogin) {
      throw new Error("Provisioned Atlas RLS role has unsafe attributes");
    }
  });
  console.log("PASS provisioned athyperapp_test as NOLOGIN/NOBYPASSRLS");
} finally {
  await sql.end();
}
