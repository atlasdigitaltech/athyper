import {
  KyselyRoundingPolicyReader,
  RoundingResolver,
  roundFinanceDecimal,
} from "@athyper/server-service-finance";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql, type KyselyPlugin } from "kysely";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import type {
  BankValidationRule,
  LookupDesiredState,
} from "@athyper/server-contract-control-admin";
import { createKyselyControlRepositories } from "./kysely-control-repositories.js";
import { verifyBankRules } from "./bank-validation.js";
import { KyselyLookupRepository } from "./kysely-lookup-repository.js";
const url = process.env["ATHYPER_CONTROL_REPO_DATABASE_URL"],
  enabled = !!url && process.env["ATHYPER_CONTROL_REPO_DB_TESTS"] === "true";
const plane = (process.env["ATHYPER_CONTROL_REPO_PLANE"] ?? "neon") as
  "neon" | "studio" | "mesh";
const connect = (app = false) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url ?? "postgres://disabled",
        ...(app ? { options: "-c role=control_repo_test" } : {}),
      }),
    }),
  });
const admin = connect(),
  db = connect(true),
  repositories = createKyselyControlRepositories({ [plane]: db });
const tenant = randomUUID(),
  actor = randomUUID(),
  connectorType = randomUUID();
const context = { tenantId: tenant, principalId: actor, planeKey: plane };
const connector = () => ({
  id: randomUUID(),
  tenantId: tenant,
  connectorTypeId: connectorType,
  code: "TEST_" + randomUUID().slice(0, 8).toUpperCase(),
  name: "Test connector",
  baseUrl: "https://example.com",
  config: {},
  endpoints: [
    { code: "health", path: "/health", method: "GET" as const, kind: "health" },
  ],
  status: "draft" as const,
  expectedVersion: 0,
});
const rounding = () => ({
  id: randomUUID(),
  tenantId: tenant,
  code: "R_" + randomUUID().slice(0, 8),
  name: "Rounding",
  method: "ROUND_HALF_EVEN" as const,
  precisionDigits: 2,
  roundingIncrement: "0.05",
  contexts: [{ slot: "DOCUMENT_TOTAL" }],
  status: "active" as const,
  expectedVersion: 0,
});
const lookup = (): LookupDesiredState => {
  const id = randomUUID();
  return {
    desiredStateId: randomUUID(),
    targetPlane: plane,
    sourceRevision: 1,
    domain: {
      id,
      code: "test.values_" + id.slice(0, 8),
      name: "Values",
      sourceSchema: "control",
      extensible: true,
      version: 1,
      status: "active",
      values: [
        {
          id: randomUUID(),
          code: "first",
          name: "First",
          sortOrder: 1,
          metadata: {},
          status: "active",
        },
      ],
    },
  };
};
async function auditCount(id: string) {
  return (
    await sql`SELECT id FROM audit.audit_log WHERE entity_id=${id}::uuid`.execute(
      admin,
    )
  ).rows.length;
}
async function waitForBlockedQuery(pattern: string) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const row = (
      await sql<{
        blocked: boolean;
      }>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0 AND query LIKE ${pattern}) AS blocked`.execute(
        admin,
      )
    ).rows[0];
    if (row?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Expected database lock contention was not observed");
}
describe.runIf(enabled)(
  `control repositories against full ${plane} DDL`,
  () => {
    beforeAll(async () => {
      await sql
        .raw(
          "DO $$ BEGIN CREATE ROLE control_repo_test; EXCEPTION WHEN duplicate_object THEN NULL; END $$;GRANT athyperapp,athyper_control_writer TO control_repo_test;",
        )
        .execute(admin);
      await sql`INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES(${tenant}::uuid,${"test_" + tenant.slice(0, 8)},'Control test','Control test','athyper','active','00000000-0000-0000-0000-000000000000')`.execute(
        admin,
      );
      await sql`INSERT INTO master.principal(id,tenant_id,code,name,principal_type,created_by) VALUES(${actor}::uuid,${tenant}::uuid,${"actor_" + actor.slice(0, 8)},'Test actor','service_account','00000000-0000-0000-0000-000000000000')`.execute(
        admin,
      );
      await sql`INSERT INTO control.connector_type(id,code,name,category_code,created_by) VALUES(${connectorType}::uuid,${"test_" + connectorType.slice(0, 8)},'Test','test',${actor}::uuid)`.execute(
        admin,
      );
    });
    afterAll(async () => {
      await db.destroy();
      await admin.destroy();
    });
    it("saves complete drafts, rejects stale writes, and enforces lifecycle", async () => {
      const repo = repositories.connectors.require(plane),
        input = connector();
      const saved = await repo.save(input, actor);
      expect(saved.endpoints[0]?.code).toBe("health");
      expect(saved.version).toBe(1);
      const results = await Promise.allSettled([
        repo.save({ ...input, name: "A", expectedVersion: 1 }, actor),
        repo.save({ ...input, name: "B", expectedVersion: 1 }, actor),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.find((r) => r.status === "rejected")).toMatchObject({
        reason: { statusCode: 409 },
      });
      const active = await repo.transition(
        tenant,
        input.id,
        "active",
        2,
        actor,
      );
      expect(active.status).toBe("active");
      await expect(
        repo.save({ ...input, expectedVersion: active.version }, actor),
      ).rejects.toMatchObject({ statusCode: 409 });
      const suspended = await repo.transition(
        tenant,
        input.id,
        "suspended",
        active.version,
        actor,
      );
      const deprecated = await repo.transition(
        tenant,
        input.id,
        "deprecated",
        suspended.version,
        actor,
      );
      await expect(
        repo.transition(tenant, input.id, "active", deprecated.version, actor),
      ).rejects.toMatchObject({ statusCode: 409 });
      expect(await repo.get(randomUUID(), input.id)).toBeUndefined();
      expect(await auditCount(input.id)).toBeGreaterThan(0);
    });
    it("queues a durable health check and executes through the probe transport", async () => {
      const repo = repositories.connectors.require(plane),
        input = connector();
      await repo.save(input, actor);
      const jobId = await repositories.healthJobs.enqueue({
        ...context,
        requestedBy: actor,
        connectorId: input.id,
      });
      expect(
        (
          await sql`SELECT 1 FROM control.connector_health_job WHERE id=${jobId}::uuid AND status='pending'`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
      let probes = 0;
      await repo.processHealthJobs(
        {
          async invoke() {
            throw new Error("must probe");
          },
          async probe(plan) {
            probes++;
            expect(plan.method).toBe("GET");
            return { status: 200, headers: {}, body: new Uint8Array() };
          },
        },
        {
          async resolve() {
            throw new Error("no credentials expected");
          },
        },
      );
      expect(probes).toBe(1);
      expect(
        (
          await sql`SELECT 1 FROM control.connector_health_job WHERE id=${jobId}::uuid AND result_code='HEALTHY'`.execute(
            admin,
          )
        ).rows,
      ).toHaveLength(1);
    });
    it("preserves lookup revisions, idempotency and tenant-owned retirement", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup();
      const first = await repo.publishDesiredState(state, actor, tenant);
      expect(first.values).toHaveLength(1);
      expect(
        (await repo.publishDesiredState(state, actor, tenant)).version,
      ).toBe(first.version);
      await expect(
        repo.publishDesiredState(
          { ...state, domain: { ...state.domain, name: "Changed" } },
          actor,
          tenant,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
      const valueId = randomUUID();
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,sort_order,is_system,created_by) VALUES(${valueId}::uuid,${state.domain.code},${tenant}::uuid,'custom','Custom',2,false,${actor}::uuid)`.execute(
        admin,
      );
      const before = (await repo.getDomain(
        state.domain.code,
        undefined,
        tenant,
      ))!;
      const next = await repo.retireValue(
        {
          domainCode: state.domain.code,
          valueCode: "custom",
          tenantId: tenant,
          expectedVersion: before.version,
        },
        actor,
      );
      expect(next.values.find((v) => v.id === valueId)?.status).toBe("retired");
      expect(
        (
          await repo.getDomain(state.domain.code, before.version, tenant)
        )?.values.find((v) => v.id === valueId)?.status,
      ).toBe("active");
      expect(
        (await repo.getDomain(state.domain.code, undefined, randomUUID()))
          ?.values,
      ).toHaveLength(1);
    });
    it("refuses retirement while an explicit reference exists", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup();
      const d = await repo.publishDesiredState(state, actor, tenant),
        id = randomUUID();
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${id}::uuid,${d.code},${tenant}::uuid,'used','Used',false,${actor}::uuid)`.execute(
        admin,
      );
      await sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${tenant}::uuid,${id}::uuid,'test',${randomUUID()}::uuid)`.execute(
        admin,
      );
      await expect(
        repo.retireValue(
          {
            domainCode: d.code,
            valueCode: "used",
            tenantId: tenant,
            expectedVersion: (await repo.getDomain(d.code, undefined, tenant))!
              .version,
          },
          actor,
        ),
      ).rejects.toMatchObject({ statusCode: 409 });
    });
    it("serializes reference insertion against retirement", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup(),
        id = randomUUID();
      await repo.publishDesiredState(state, actor, tenant);
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${id}::uuid,${state.domain.code},${tenant}::uuid,'race','Race',false,${actor}::uuid)`.execute(
        admin,
      );
      const current = (await repo.getDomain(
        state.domain.code,
        undefined,
        tenant,
      ))!;
      let release!: () => void, ready!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const inserted = new Promise<void>((resolve) => {
        ready = resolve;
      });
      const insertion = db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(
          tx,
        );
        await sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${tenant}::uuid,${id}::uuid,'race',${randomUUID()}::uuid)`.execute(
          tx,
        );
        ready();
        await held;
      });
      await inserted;
      const retirement = repo.retireValue(
        {
          domainCode: state.domain.code,
          valueCode: "race",
          tenantId: tenant,
          expectedVersion: current.version,
        },
        actor,
      );
      release();
      await insertion;
      await expect(retirement).rejects.toMatchObject({ statusCode: 409 });
      expect(
        (await repo.getDomain(
          state.domain.code,
          undefined,
          tenant,
        ))!.values.find((v) => v.id === id)?.status,
      ).toBe("active");
    });
    it("returns not found for a missing lifecycle target even at version zero", async () => {
      await expect(
        repositories.connectors
          .require(plane)
          .transition(tenant, randomUUID(), "active", 0, actor),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
    for (const foreign of [false, true])
      for (const retire of [false, true]) {
        it(`protects ${foreign ? "foreign" : "own"} tenant references when ${retire ? "retiring" : "disabling extensions"}`, async () => {
          const repo = repositories.lookups.require(plane),
            state = lookup();
          await repo.publishDesiredState(state, actor, tenant);
          const owner = foreign ? randomUUID() : tenant,
            value = randomUUID();
          if (foreign)
            await sql`INSERT INTO master.tenant(id,code,name,display_name,realm_key,status,created_by) VALUES(${owner}::uuid,${"test_" + owner.slice(0, 8)},'Foreign','Foreign','athyper','active','00000000-0000-0000-0000-000000000000')`.execute(
              admin,
            );
          await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${value}::uuid,${state.domain.code},${owner}::uuid,'extension','Extension',false,${actor}::uuid)`.execute(
            admin,
          );
          await sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${owner}::uuid,${value}::uuid,'guard',${randomUUID()}::uuid)`.execute(
            admin,
          );
          const before = (await repo.getDomain(
              state.domain.code,
              undefined,
              tenant,
            ))!,
            count = await auditCount(state.domain.id);
          const next = {
            ...state,
            desiredStateId: randomUUID(),
            sourceRevision: 2,
            domain: {
              ...state.domain,
              status: retire ? ("retired" as const) : ("active" as const),
              extensible: retire ? true : false,
            },
          };
          await expect(
            repo.publishDesiredState(next, actor, tenant),
          ).rejects.toMatchObject({
            statusCode: 409,
            code: "CONTROL_ADMIN_REFERENCE_IN_USE",
          });
          expect(
            await repo.getDomain(state.domain.code, undefined, tenant),
          ).toEqual(before);
          expect(await auditCount(state.domain.id)).toBe(count);
          expect(
            (
              await sql`SELECT 1 FROM control.lookup_publication_receipt WHERE desired_state_id=${next.desiredStateId}`.execute(
                admin,
              )
            ).rows,
          ).toHaveLength(0);
          // Direct domain writes have the same protection, including against another tenant.
          await expect(
            sql`UPDATE control.lookup_domain SET status=${retire ? "deprecated" : "active"},is_extensible=${retire},updated_by=${actor}::uuid WHERE code=${state.domain.code}`.execute(
              admin,
            ),
          ).rejects.toMatchObject({ code: "23503" });
          await sql`DELETE FROM control.lookup_value_reference WHERE value_id=${value}::uuid`.execute(
            admin,
          );
          await expect(
            repo.publishDesiredState(next, actor, tenant),
          ).resolves.toMatchObject({
            status: next.domain.status,
            extensible: next.domain.extensible,
          });
          await expect(
            sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${owner}::uuid,${value}::uuid,'guard',${randomUUID()}::uuid)`.execute(
              admin,
            ),
          ).rejects.toMatchObject({ code: "23514" });
        });
      }
    it("waits for an in-flight tenant reference before domain publication", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup(),
        value = randomUUID();
      await repo.publishDesiredState(state, actor, tenant);
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${value}::uuid,${state.domain.code},${tenant}::uuid,'concurrent','Concurrent',false,${actor}::uuid)`.execute(
        admin,
      );
      let release!: () => void, ready!: () => void;
      const held = new Promise<void>((r) => (release = r)),
        inserted = new Promise<void>((r) => (ready = r));
      const inserting = db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(
          tx,
        );
        await sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${tenant}::uuid,${value}::uuid,'race',${randomUUID()}::uuid)`.execute(
          tx,
        );
        ready();
        await held;
      });
      await inserted;
      const publishing = repo.publishDesiredState(
        {
          ...state,
          desiredStateId: randomUUID(),
          sourceRevision: 2,
          domain: { ...state.domain, extensible: false },
        },
        actor,
        tenant,
      );
      const rejected = expect(publishing).rejects.toMatchObject({
        statusCode: 409,
      });
      try {
        await waitForBlockedQuery("%control.lookup_domain%FOR UPDATE%");
      } finally {
        release();
      }
      await inserting;
      await rejected;
    });
    it("rejects references that arrive during a committing domain disable", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup(),
        value = randomUUID();
      await repo.publishDesiredState(state, actor, tenant);
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${value}::uuid,${state.domain.code},${tenant}::uuid,'late','Late',false,${actor}::uuid)`.execute(
        admin,
      );
      let release!: () => void, ready!: () => void;
      const held = new Promise<void>((r) => (release = r)),
        updated = new Promise<void>((r) => (ready = r));
      const disabling = db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${actor},true)`.execute(
          tx,
        );
        await sql`UPDATE control.lookup_domain SET is_extensible=false WHERE code=${state.domain.code}`.execute(
          tx,
        );
        ready();
        await held;
      });
      await updated;
      const reference = admin
        .transaction()
        .execute((tx) =>
          sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${tenant}::uuid,${value}::uuid,'late',${randomUUID()}::uuid)`.execute(
            tx,
          ),
        );
      const rejected = expect(reference).rejects.toMatchObject({
        code: "23514",
      });
      try {
        await waitForBlockedQuery(
          "%INSERT INTO control.lookup_value_reference%",
        );
      } finally {
        release();
      }
      await disabling;
      await rejected;
    });
    it("allows disabling extensions with only global references and keeps private inspection inaccessible", async () => {
      const repo = repositories.lookups.require(plane),
        state = lookup();
      await repo.publishDesiredState(state, actor, tenant);
      await sql`INSERT INTO control.lookup_value_reference(tenant_id,value_id,owner_type,owner_id) VALUES(${tenant}::uuid,${state.domain.values[0]!.id}::uuid,'global',${randomUUID()}::uuid)`.execute(
        admin,
      );
      await expect(
        repo.publishDesiredState(
          {
            ...state,
            desiredStateId: randomUUID(),
            sourceRevision: 2,
            domain: { ...state.domain, extensible: false },
          },
          actor,
          tenant,
        ),
      ).resolves.toMatchObject({ extensible: false });
      expect(
        (
          await sql<{
            allowed: boolean;
          }>`SELECT has_function_privilege('athyperapp','control.lookup_value_has_references(uuid)','EXECUTE') AS allowed`.execute(
            admin,
          )
        ).rows[0]?.allowed,
      ).toBe(false);
    });
    it("recognizes native cycle references to tenant extensions", async () => {
      const id = randomUUID(),
        cycle = randomUUID(),
        code = "cycle_" + id.slice(0, 8);
      await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${id}::uuid,'governance.cycle_domain',${tenant}::uuid,${code},'Cycle extension',false,${actor}::uuid)`.execute(
        admin,
      );
      await sql`INSERT INTO control.cycle_type(id,tenant_id,code,name,domain_code,frequency,created_by) VALUES(${cycle}::uuid,${tenant}::uuid,${"C_" + id.slice(0, 8).toUpperCase()},'Guard cycle',${code},'monthly',${actor}::uuid)`.execute(
        admin,
      );
      expect(
        (
          await sql<{
            used: boolean;
          }>`SELECT control.lookup_value_has_references(${id}::uuid) AS used`.execute(
            admin,
          )
        ).rows[0]?.used,
      ).toBe(true);
      await expect(
        sql`UPDATE control.lookup_domain SET is_extensible=false WHERE code='governance.cycle_domain'`.execute(
          admin,
        ),
      ).rejects.toMatchObject({ code: "23503" });
    });
    for (const list of [false, true])
      for (const retirement of [false, true]) {
        it(`keeps ${list ? "list" : "single-domain"} reads consistent across concurrent ${retirement ? "tenant retirement" : "publication"}`, async () => {
          const repo = repositories.lookups.require(plane),
            state = lookup(),
            extension = randomUUID();
          await repo.publishDesiredState(state, actor, tenant);
          await sql`INSERT INTO control.lookup_value(id,domain_code,tenant_id,code,name,is_system,created_by) VALUES(${extension}::uuid,${state.domain.code},${tenant}::uuid,'extension','Extension',false,${actor}::uuid)`.execute(
            admin,
          );
          const before = (await repo.getDomain(
            state.domain.code,
            undefined,
            tenant,
          ))!;
          let release!: () => void,
            ready!: () => void,
            intercepted = false;
          const held = new Promise<void>((r) => (release = r)),
            domainRead = new Promise<void>((r) => (ready = r));
          const pending = new Set<object>();
          const plugin: KyselyPlugin = {
            transformQuery(args) {
              if (
                !intercepted &&
                args.node.kind === "RawNode" &&
                args.node.sqlFragments
                  .join("")
                  .includes("SELECT * FROM control.lookup_domain")
              ) {
                intercepted = true;
                pending.add(args.queryId);
              }
              return args.node;
            },
            async transformResult(args) {
              if (pending.delete(args.queryId)) {
                ready();
                await held;
              }
              return args.result;
            },
          };
          // This hook pauses after PostgreSQL has returned the domain row, before values are queried.
          const reader = new KyselyLookupRepository(
            db.withPlugin(plugin),
            plane,
          );
          const reading = list
            ? reader
                .listDomains(tenant)
                .then((rows) => rows.find((d) => d.code === state.domain.code))
            : reader.getDomain(state.domain.code, undefined, tenant);
          try {
            await Promise.race([
              domainRead,
              reading.then(() => {
                throw new Error("Domain read was not intercepted");
              }),
            ]);
            if (retirement)
              await repo.retireValue(
                {
                  domainCode: state.domain.code,
                  valueCode: "extension",
                  tenantId: tenant,
                  expectedVersion: before.version,
                },
                actor,
              );
            else
              await repo.publishDesiredState(
                {
                  ...state,
                  desiredStateId: randomUUID(),
                  sourceRevision: 2,
                  domain: {
                    ...state.domain,
                    name: "New domain",
                    values: state.domain.values.map((v) => ({
                      ...v,
                      name: "New value",
                    })),
                  },
                },
                actor,
                tenant,
              );
          } finally {
            release();
          }
          const result = await reading;
          expect(result).toEqual(before);
          const historical = (await repo.getDomain(
            state.domain.code,
            before.version,
            tenant,
          ))!;
          expect(result?.version).toBe(historical.version);
          expect(
            result?.values.map((v) => [v.id, v.name, v.status]).sort(),
          ).toEqual(
            historical.values.map((v) => [v.id, v.name, v.status]).sort(),
          );
          const after = (await repo.getDomain(
            state.domain.code,
            undefined,
            tenant,
          ))!;
          expect(after.version).toBeGreaterThan(before.version);
          if (retirement)
            expect(after.values.find((v) => v.id === extension)?.status).toBe(
              "retired",
            );
          else
            expect(after.values.find((v) => v.code === "first")?.name).toBe(
              "New value",
            );
        });
      }
    it.each([
      { status: "deprecated" },
      { country_code: "DE" },
      { payment_rail_code: "unrelated" },
      { currency_code: "EUR" },
      { direction: "outbound" },
    ])("ignores unsupported inapplicable bank rules %j", async (fields) => {
      const repo = repositories.bankValidation.require(plane);
      const rail = "test_" + randomUUID().slice(0, 8);
      const ids = [randomUUID(), randomUUID()];
      try {
        for (const [index, id] of ids.entries()) {
          const row = {
            id,
            code: "TEST_" + id.replaceAll("-", "").toUpperCase(),
            name: "Candidate test",
            country_code: "US",
            payment_rail_code: rail,
            account_identifier_type: "account_number",
            bank_identifier_type: "bank_code",
            direction: "both",
            status: "active",
            is_account_identifier_required: true,
            is_bank_identifier_required: false,
            is_checksum_validated: false,
            account_pattern: "^[0-9]{4}$",
            priority: 10,
            created_by: actor,
            ...(index === 1
              ? { ...fields, is_national_bank_code_required: true }
              : {}),
          };
          await admin
            .insertInto("control.bank_account_validation_rule" as never)
            .values(row as never)
            .execute();
        }
        const input = {
          countryCode: "US",
          railCode: rail,
          currencyCode: "USD",
          direction: "inbound" as const,
          accountIdentifier: "1234",
        };
        const candidates = await repo.listApplicable(input);
        expect(candidates.map((r) => r.id)).toEqual([ids[0]]);
        expect(
          (await repo.listApplicable({ ...input, direction: undefined })).map(
            (r) => r.id,
          ),
        ).toEqual([ids[0]]);
        expect(verifyBankRules(candidates, input)).toMatchObject({
          valid: true,
          ruleId: ids[0],
        });
      } finally {
        await sql`DELETE FROM control.bank_account_validation_rule WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})`.execute(
          admin,
        );
      }
    });
    it("fails closed for applicable unsupported rules without falling back to a generic rule", async () => {
      const repo = repositories.bankValidation.require(plane);
      const rail = "test_" + randomUUID().slice(0, 8);
      const ids = [randomUUID(), randomUUID()];
      try {
        for (const [index, id] of ids.entries()) {
          await sql`INSERT INTO control.bank_account_validation_rule
            (id,code,name,country_code,payment_rail_code,account_identifier_type,bank_identifier_type,direction,status,currency_code,priority,is_national_bank_code_required,created_by)
            VALUES (${id}::uuid,${"TEST_" + id.replaceAll("-", "").toUpperCase()},'Candidate test','US',${rail},'account_number','bank_code','both','active',${index ? "USD" : null},${index ? 20 : 10},${index === 1},${actor}::uuid)`.execute(
            admin,
          );
        }
        await expect(
          repo.listApplicable({
            countryCode: "US",
            railCode: rail,
            currencyCode: "USD",
          }),
        ).rejects.toMatchObject({
          statusCode: 503,
          code: "CONTROL_ADMIN_BANK_NATIVE_RULE_UNSUPPORTED",
        });
        expect(
          (
            await repo.listApplicable({ countryCode: "US", railCode: rail })
          ).map((r) => r.id),
        ).toEqual([ids[0]]);
        expect(
          await repo.listApplicable({ countryCode: "DE", railCode: rail }),
        ).toEqual([]);
      } finally {
        await sql`DELETE FROM control.bank_account_validation_rule WHERE id IN (${sql.join(ids.map((id) => sql`${id}::uuid`))})`.execute(
          admin,
        );
      }
    });
    it("reads seeded bank rules without losing direction", async () => {
      const rules = await repositories.bankValidation.require(plane).list();
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.direction === "outbound")).toBe(true);
    });
    if (plane === "studio") it(
      "publishes bank fixtures with version checks",
      async () => {
        const railCode = "test_" + randomUUID().slice(0, 8);
        const rule: BankValidationRule = {
          id: randomUUID(),
          version: 1,
          code: "TEST_" + randomUUID().slice(0, 8).toUpperCase(),
          name: "Test",
          accountIdentifierType: "account_number",
          bankIdentifierType: "bank_code",
          countryCode: "US",
          railCode,
          priority: 1000,
          accountRequired: true,
          bankRequired: false,
          bicAllowed: true,
          bicRequired: false,
          branchRequired: false,
          checksumValidated: false,
          accountPattern: "^[0-9]{4}$",
          fixtures: [
            {
              input: {
                countryCode: "US",
                railCode,
                accountIdentifier: "1234",
              },
              valid: true,
            },
          ],
          status: "active",
        };
        const repo = repositories.bankValidation.require(plane);
        expect((await repo.publish(rule, actor, tenant)).version).toBe(1);
        expect(
          verifyBankRules(await repo.list(), rule.fixtures[0]!.input).valid,
        ).toBe(true);
        await expect(repo.publish(rule, actor, tenant)).rejects.toMatchObject({
          statusCode: 409,
        });
      },
    );
    if (plane === "neon") it(
      "writes finance dispatch and releases the coordinate on retirement",
      async () => {
        const repo = repositories.rounding.require(plane),
          input = rounding(),
          saved = await repo.save(input, actor);
        expect(saved.roundingIncrement).toBe("0.05");
        const resolver = new RoundingResolver(
          new KyselyRoundingPolicyReader(admin),
        );
        const request = { tenantId: tenant, slot: "DOCUMENT_TOTAL" as const };
        const evidence = await resolver.resolve(request);
        expect(evidence.ruleId).toBe(saved.id);
        expect(roundFinanceDecimal("1.025", evidence)).toBe("1.00");
        expect(
          (
            await sql`SELECT 1 FROM control.rounding_context c JOIN control.rounding_rule r ON r.id=c.rounding_rule_id WHERE r.id=${input.id}::uuid AND r.status='active'`.execute(
              admin,
            )
          ).rows,
        ).toHaveLength(1);
        await expect(repo.save(rounding(), actor)).rejects.toMatchObject({
          statusCode: 409,
        });
        await repo.retire(tenant, input.id, saved.version, actor);
        await expect(resolver.resolve(request)).rejects.toMatchObject({
          code: "FINANCE_NOT_FOUND",
        });
        expect((await repo.get(tenant, input.id))?.contexts).toEqual(
          input.contexts,
        );
        await expect(repo.save(rounding(), actor)).resolves.toMatchObject({
          status: "active",
        });
      },
    );
    it("rolls back parent and children when outbox insertion fails", async () => {
      const input = connector();
      await sql
        .raw(
          `CREATE FUNCTION event.control_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.entity_id='${input.id}'::uuid THEN RAISE EXCEPTION 'outbox failed'; END IF; RETURN NEW; END $$;CREATE TRIGGER control_test_fail BEFORE INSERT ON event.outbox FOR EACH ROW EXECUTE FUNCTION event.control_test_fail();`,
        )
        .execute(admin);
      try {
        await expect(
          repositories.connectors.require(plane).save(input, actor),
        ).rejects.toThrow("outbox failed");
        expect(
          await repositories.connectors.require(plane).get(tenant, input.id),
        ).toBeUndefined();
        expect(await auditCount(input.id)).toBe(0);
      } finally {
        await sql
          .raw(
            "DROP TRIGGER control_test_fail ON event.outbox;DROP FUNCTION event.control_test_fail();",
          )
          .execute(admin);
      }
    });
  },
);
