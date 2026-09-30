import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { loadPlaneTestDatabases, postgresServiceTestsEnabled } from "@athyper/server-test-utils";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { KyselyExperiencePlaneRepository } from "./index.js";

type Database = Kysely<Record<string, never>>;
const configurations = postgresServiceTestsEnabled() ? loadPlaneTestDatabases() : [];
const clients = configurations.map(configuration => ({
  configuration,
  database: new Kysely<Record<string, never>>({dialect:new PostgresDialect({pool:new Pool({connectionString:configuration.connectionString,max:1})})}),
}));
afterAll(async () => { await Promise.all(clients.map(({database}) => database.destroy())); });

// No fixture provisioning or committed mutations: every test ends in ROLLBACK.
// Connection role must be able to inspect fixtures and SET ROLE to the runtime role.
describe.runIf(postgresServiceTestsEnabled())("all-plane localization qualification", () => {
for (const {configuration,database} of clients) {
  describe(`localization RLS: ${configuration.plane}`, () => {
    async function rollback(work: (transaction:Database, context:VerifiedRequestContext, otherTenant:VerifiedRequestContext, otherPrincipal:VerifiedRequestContext) => Promise<void>) {
      const completed = new Error("rollback successful localization qualification");
      await expect(database.transaction().execute(async transaction => {
        const fixtures = (await sql<{tenantId:string;principalId:string;realmKey:string}>`
          SELECT tenant.id::text AS "tenantId",principal.id::text AS "principalId",tenant.realm_key AS "realmKey"
          FROM master.tenant tenant JOIN master.principal principal ON principal.tenant_id=tenant.id
          WHERE tenant.status='active' AND principal.status='active'
            AND tenant.id <> '00000000-0000-0000-0000-000000000000'::uuid
          ORDER BY tenant.id,principal.id`.execute(transaction)).rows;
        const first = fixtures.find(row => fixtures.some(other => other.tenantId===row.tenantId && other.principalId!==row.principalId));
        expect(first, "requires an active tenant with two active principals").toBeDefined();
        const differentTenant = fixtures.find(row => row.tenantId!==first!.tenantId);
        const differentPrincipal = fixtures.find(row => row.tenantId===first!.tenantId && row.principalId!==first!.principalId);
        expect(differentTenant, "requires a second real active tenant").toBeDefined();
        const makeContext = (row:typeof first):VerifiedRequestContext => ({...row!,planeKey:configuration.plane}) as VerifiedRequestContext;
        if (!/^[a-z_][a-z0-9_]*$/.test(configuration.expectedRole)) throw new Error("Unsafe role name");
        await sql.raw(`SET LOCAL ROLE "${configuration.expectedRole}"`).execute(transaction);
        await sql`SELECT set_config('app.current_tenant_id',${first!.tenantId},true),
          set_config('app.current_principal_id',${first!.principalId},true),
          set_config('app.current_plane_key',${configuration.plane},true),
          set_config('app.current_request_id','11111111-1111-4111-8111-111111111119',true),
          set_config('app.current_correlation_id','11111111-1111-4111-8111-111111111118',true),
          set_config('lock_timeout','5000',true),set_config('statement_timeout','15000',true)`.execute(transaction);
        const identity = (await sql<{databaseName:string;plane:string;role:string;superuser:boolean;bypass:boolean}>`
          SELECT current_database() AS "databaseName",current_setting('app.database_plane',true) AS plane,
            current_user AS role,rolsuper AS superuser,rolbypassrls AS bypass FROM pg_roles WHERE rolname=current_user`.execute(transaction)).rows[0];
        expect(identity).toEqual({databaseName:`athyper_${configuration.plane}`,plane:configuration.plane,role:configuration.expectedRole,superuser:false,bypass:false});
        await work(transaction,makeContext(first),makeContext(differentTenant),makeContext(differentPrincipal));
        throw completed;
      })).rejects.toBe(completed);
    }

    it("uses the correct physical plane with active, forced RLS on localization tables", async () => {
      await rollback(async transaction => {
        const rows=(await sql<{name:string;enabled:boolean;forced:boolean;active:boolean}>`
          SELECT oid::regclass::text AS name,relrowsecurity AS enabled,relforcerowsecurity AS forced,row_security_active(oid) AS active
          FROM pg_class WHERE oid IN ('master.tenant'::regclass,'master.tenant_profile'::regclass,
            'master.tenant_locale_activation'::regclass,'master.principal_ui_profile'::regclass)`.execute(transaction)).rows;
        expect(rows).toHaveLength(4);
        for(const row of rows) expect(row).toMatchObject({enabled:true,forced:true,active:true});
      });
    });

    it("reads and replaces tenant policy, switches defaults, and saves only the current principal's regional locale", async () => {
      await rollback(async (transaction,context) => {
        const repository=new KyselyExperiencePlaneRepository(transaction);
        const before=await repository.readLocalePolicy(context);
        expect(before.catalogs).toHaveLength(8);
        const input={catalogs:before.catalogs!.map(row=>({...row,status:"qualified",coveragePct:100,linguisticReviewPassed:true,layoutReviewPassed:true,automatedTestsPassed:true})),enabledLocales:["en","ar"],defaultLocale:"ar",fallbackLocale:"en"};
        let saved=await repository.updateLocalePolicy(context,input);
        expect(saved).toMatchObject({defaultLocale:"ar",enabledLocales:["ar","en"],fallbackLocale:"en"});
        saved=await repository.updateLocalePolicy(context,{...input,defaultLocale:"en"});
        expect(await repository.readLocalePolicy(context)).toEqual(saved);
        await repository.updatePrincipalLocale(context,"ar-SA",saved.revision);
        expect(await repository.readProfile(context)).toMatchObject({principal:{localeCode:"ar-SA",languageCode:"ar"}});
      });
    });

    it("hides other tenants and principals even when repository coordinates are substituted", async () => {
      await rollback(async (transaction,context,otherTenant,otherPrincipal) => {
        const repository=new KyselyExperiencePlaneRepository(transaction);
        expect(await repository.readProfile(otherTenant)).toMatchObject({revision:"profile:missing"});
        expect((await repository.readProfile(otherPrincipal)).principal).toBeUndefined();
        expect((await repository.readLocalePolicy(otherTenant)).enabledLocales).toEqual([]);
        const visible=(await sql<{count:number}>`SELECT count(*)::int AS count FROM master.tenant_locale_activation WHERE tenant_id=${otherTenant.tenantId}::uuid`.execute(transaction)).rows[0];
        expect(visible?.count).toBe(0);
        const current=await repository.readLocalePolicy(context);
        await expect(repository.updatePrincipalLocale(otherTenant,"en",current.revision)).rejects.toMatchObject({status:403});
      });
    });

    it("rejects a direct cross-tenant activation write at the database boundary", async () => {
      await rollback(async (transaction,context,otherTenant) => {
        await expect(sql`INSERT INTO master.tenant_locale_activation(tenant_id,locale_code,enabled,created_by)
          VALUES(${otherTenant.tenantId}::uuid,'en',true,${context.principalId}::uuid)
          ON CONFLICT(tenant_id,locale_code) DO UPDATE SET enabled=true`.execute(transaction)).rejects.toMatchObject({code:"42501"});
      });
    });

    it("rejects a different principal's locale write within the same tenant", async () => {
      await rollback(async (transaction,context,_otherTenant,otherPrincipal) => {
        const repository=new KyselyExperiencePlaneRepository(transaction);
        const current=await repository.readLocalePolicy(context);
        await expect(repository.updatePrincipalLocale(otherPrincipal,"en",current.revision)).rejects.toMatchObject({code:"42501"});
      });
    });

    it("fails closed when tenant and principal context settings are absent", async () => {
      await rollback(async (transaction,context) => {
        await sql`SELECT set_config('app.current_tenant_id','',true),set_config('app.current_principal_id','',true)`.execute(transaction);
        const repository=new KyselyExperiencePlaneRepository(transaction);
        expect(await repository.readProfile(context)).toMatchObject({revision:"profile:missing"});
        expect((await repository.readLocalePolicy(context)).enabledLocales).toEqual([]);
        await expect(repository.updatePrincipalLocale(context,"en","irrelevant")).rejects.toMatchObject({status:403});
      });
    });
  });
}

});
