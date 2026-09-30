import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { KyselyExperiencePlaneRepository } from "./index.js";

// Explicitly opt in with an EMPTY, DISPOSABLE PostgreSQL database.
const url = process.env.ATHYPER_LOCALIZATION_TEST_DATABASE_URL;
const database = url ? new Kysely<Record<string, never>>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString: url }) }) }) : undefined;
const tenantId = "10000000-0000-4000-8000-000000000001";
const otherTenantId = "10000000-0000-4000-8000-000000000002";
const principalId = "20000000-0000-4000-8000-000000000001";
const context = { tenantId, principalId, planeKey: "neon" } as VerifiedRequestContext;
const codes = ["en", "ar", "ms", "zh-Hans", "hi", "ta", "fr", "de"];
function policy(defaultLocale = "en") {
  return { catalogs: codes.map(localeCode => ({ localeCode, status: "qualified", coveragePct: 100, linguisticReviewPassed: true, layoutReviewPassed: true, automatedTestsPassed: true })), enabledLocales: ["en", "ar"], defaultLocale, fallbackLocale: "en" };
}

describe.runIf(Boolean(url))("localization PostgreSQL replacement and tenant isolation", () => {
  beforeAll(async () => {
    await sql.raw(`CREATE SCHEMA shared; CREATE SCHEMA control; CREATE SCHEMA master;
      CREATE TABLE shared.locale(code text PRIMARY KEY);
      CREATE TABLE master.tenant(id uuid PRIMARY KEY);
      CREATE TABLE master.principal_ui_profile (
        tenant_id uuid NOT NULL REFERENCES master.tenant(id),principal_id uuid NOT NULL,
        locale_code text,language_code text,created_by uuid NOT NULL,
        updated_at timestamptz,updated_by uuid,
        CONSTRAINT principal_ui_profile_tenant_principal_uq UNIQUE(tenant_id,principal_id)
      );
      CREATE TABLE master.tenant_profile (
        tenant_id uuid NOT NULL REFERENCES master.tenant(id),
        enabled_locale_codes text[], default_locale_code text, fallback_locale_code text,
        locale_catalog_governance jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
        updated_at timestamptz, updated_by uuid,
        CONSTRAINT tenant_profile_tenant_uq UNIQUE(tenant_id)
      );`).execute(database!);
    const ddl = readFileSync(new URL("../../../../db/ddl/common/control/03_tables.sql", import.meta.url), "utf8");
    for (const table of ["control.ui_locale_catalog", "master.tenant_locale_activation"]) {
      const start = ddl.indexOf(`CREATE TABLE ${table} (`);
      await sql.raw(ddl.slice(start, ddl.indexOf("\n);", start) + 3)).execute(database!);
    }
    const indexes = readFileSync(new URL("../../../../db/ddl/common/control/06_indexes.sql", import.meta.url), "utf8");
    for (const name of ["tenant_locale_activation_one_default_uq", "tenant_locale_activation_one_fallback_uq"]) {
      const start = indexes.indexOf(`CREATE UNIQUE INDEX ${name}`);
      await sql.raw(indexes.slice(start, indexes.indexOf(";", start) + 1)).execute(database!);
    }
    await sql`INSERT INTO master.tenant VALUES(${tenantId}::uuid),(${otherTenantId}::uuid)`.execute(database!);
    for (const localeCode of codes) {
      await sql`INSERT INTO shared.locale VALUES(${localeCode})`.execute(database!);
      await sql`INSERT INTO control.ui_locale_catalog(locale_code,format_locale_code,rollout_wave,status,coverage_pct,linguistic_review_passed,layout_review_passed,automated_tests_passed,created_by)
        VALUES(${localeCode},${localeCode},0,'qualified',100,true,true,true,${principalId}::uuid)`.execute(database!);
    }
  });
  afterAll(async () => { await database?.destroy(); });

  it("repeats PUT, switches defaults both ways, and preserves one English fallback", async () => {
    const repository = new KyselyExperiencePlaneRepository(database!);
    for (const defaultLocale of ["en", "en", "ar", "en", "ar"]) {
      const saved = await repository.updateLocalePolicy(context, policy(defaultLocale));
      expect(saved).toMatchObject({ enabledLocales: ["ar", "en"], defaultLocale, fallbackLocale: "en" });
      expect(await repository.readLocalePolicy(context)).toEqual(saved);
    }
  });

  it("keeps one tenant's review changes out of other tenants and the shared catalog", async () => {
    const repository = new KyselyExperiencePlaneRepository(database!);
    const other = { ...context, tenantId: otherTenantId };
    await repository.updateLocalePolicy(other, policy("ar"));
    const before = await repository.readLocalePolicy(other);
    const input = policy();
    input.enabledLocales = ["en"];
    input.catalogs = input.catalogs.map(row => row.localeCode === "ar" ? { ...row, status: "draft", coveragePct: 0 } : row);
    expect(await repository.updateLocalePolicy(context, input)).toMatchObject({ catalogs: expect.arrayContaining([expect.objectContaining({ localeCode: "ar", status: "draft" })]) });
    expect(await repository.readLocalePolicy(other)).toEqual(before);
    expect((await sql<{status:string}>`SELECT status FROM control.ui_locale_catalog WHERE locale_code='ar'`.execute(database!)).rows[0]?.status).toBe("qualified");
  });

  it("rolls back the whole replacement when activation fails", async () => {
    const repository = new KyselyExperiencePlaneRepository(database!);
    const before = await repository.readLocalePolicy(context);
    await sql.raw("ALTER TABLE master.tenant_locale_activation ADD CONSTRAINT test_reject_ar CHECK (NOT (locale_code='ar' AND enabled)) NOT VALID").execute(database!);
    try {
      await expect(repository.updateLocalePolicy(context, policy("ar"))).rejects.toThrow();
      expect(await repository.readLocalePolicy(context)).toEqual(before);
    } finally {
      await sql.raw("ALTER TABLE master.tenant_locale_activation DROP CONSTRAINT test_reject_ar").execute(database!);
    }
  });

  it("serializes concurrent replacements and supports an existing transaction runner", async () => {
    const repository = new KyselyExperiencePlaneRepository(database!);
    const results = await Promise.all([repository.updateLocalePolicy(context, policy("ar")), repository.updateLocalePolicy(context, policy("en"))]);
    expect(results.map(row => row.defaultLocale)).toEqual(["ar", "en"]);
    const transactional = new KyselyExperiencePlaneRepository(database!, (_context, work) => database!.transaction().execute(work));
    expect(await transactional.updateLocalePolicy(context, policy("ar"))).toMatchObject({ defaultLocale: "ar", fallbackLocale: "en" });
  });

  it("rejects stale PATCH validation after a concurrent policy disable without saving the preference", async () => {
    const repository = new KyselyExperiencePlaneRepository(database!);
    const enabled = await repository.updateLocalePolicy(context,policy("ar"));
    await repository.updatePrincipalLocale(context,"ar-SA",enabled.revision);
    let pending!: Promise<unknown>;
    await database!.transaction().execute(async transaction => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${"experience-locale-policy:" + tenantId},0))`.execute(transaction);
      pending = repository.updatePrincipalLocale(context,"ar-EG",enabled.revision).then(()=>undefined,error=>error);
      const transactional = new KyselyExperiencePlaneRepository(transaction);
      await transactional.updateLocalePolicy(context,{...policy(),enabledLocales:["en"]});
    });
    expect(await pending).toMatchObject({status:409,code:"EXPERIENCE_LOCALE_POLICY_CHANGED"});
    const profile = await sql<{locale:string}>`SELECT locale_code AS locale FROM master.principal_ui_profile WHERE tenant_id=${tenantId}::uuid AND principal_id=${principalId}::uuid`.execute(database!);
    expect(profile.rows[0]?.locale).toBe("ar-SA");
    const current=await repository.readLocalePolicy(context);
    await repository.updatePrincipalLocale(context,"en-GB",current.revision);
  });

  it("rejects an incomplete target catalog instead of silently dropping enabled locales", async () => {
    const rollback = new Error("rollback fixture");
    await expect(database!.transaction().execute(async transaction => {
      await sql`DELETE FROM master.tenant_locale_activation WHERE locale_code='fr'`.execute(transaction);
      await sql`DELETE FROM control.ui_locale_catalog WHERE locale_code='fr'`.execute(transaction);
      const repository = new KyselyExperiencePlaneRepository(transaction);
      const before=await repository.readLocalePolicy(context);
      await expect(repository.updateLocalePolicy(context,{...policy("fr"),enabledLocales:["en","fr"]})).rejects.toMatchObject({status:503,code:"EXPERIENCE_EXACT_PLANE_CATALOG_UNAVAILABLE"});
      expect(await repository.readLocalePolicy(context)).toEqual(before);
      throw rollback;
    })).rejects.toBe(rollback);
  });

  it("supports runtime grants with read-only tenants and enforces tenant RLS", async () => {
    await sql.raw(`CREATE ROLE locale_runtime;
      GRANT USAGE ON SCHEMA master,control TO locale_runtime;
      GRANT SELECT ON master.tenant TO locale_runtime;
      GRANT SELECT,INSERT,UPDATE ON master.tenant_profile,master.principal_ui_profile,master.tenant_locale_activation,control.ui_locale_catalog TO locale_runtime;
      ALTER TABLE master.tenant ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_tenant_read ON master.tenant FOR SELECT USING(id=current_setting('app.current_tenant_id')::uuid);
      ALTER TABLE master.tenant_profile ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_profile_access ON master.tenant_profile USING(tenant_id=current_setting('app.current_tenant_id')::uuid);
      ALTER TABLE master.principal_ui_profile ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_principal_access ON master.principal_ui_profile USING(tenant_id=current_setting('app.current_tenant_id')::uuid);
      ALTER TABLE master.tenant_locale_activation ENABLE ROW LEVEL SECURITY;
      CREATE POLICY test_activation_access ON master.tenant_locale_activation USING(tenant_id=current_setting('app.current_tenant_id')::uuid);
    `).execute(database!);
    await database!.transaction().execute(async transaction => {
      await sql.raw("SET LOCAL ROLE locale_runtime").execute(transaction);
      await sql`SELECT set_config('app.current_tenant_id',${tenantId},true)`.execute(transaction);
      const repository = new KyselyExperiencePlaneRepository(transaction);
      const saved=await repository.updateLocalePolicy(context,policy("ar"));
      await repository.updatePrincipalLocale(context,"ar-SA",saved.revision);
      await expect(repository.updateLocalePolicy({...context,tenantId:otherTenantId},policy())).rejects.toMatchObject({status:403,code:"EXPERIENCE_TENANT_NOT_FOUND"});
    });
  });
});
