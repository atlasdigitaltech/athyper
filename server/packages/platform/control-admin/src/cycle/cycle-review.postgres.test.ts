import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import { Kysely, PostgresDialect, sql } from "kysely";
import { beforeAll, afterAll, it, describe, expect } from "vitest";
import { KyselyCycleTemplateRepository } from "./kysely-cycle-template-repository.js";
import { cycleTemplateHash } from "./cycle-config-service.js";
import { validTemplate } from "./cycle-test-fixtures.js";
const url = process.env["ATHYPER_CYCLE_REVIEW_DATABASE_URL"];
const enabled =
  process.env["ATHYPER_CYCLE_REVIEW_DB_TESTS"] === "true" && Boolean(url);
const connect = (role = false) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: url ?? "postgres://disabled",
        ...(role ? { options: "-c role=cycle_review_app" } : {}),
      }),
    }),
  });
const admin = connect(),
  db = connect(true),
  repo = new KyselyCycleTemplateRepository(db);
const tenant = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000099",
  template = validTemplate();
const input = {
  tenantId: tenant,
  principalId: actor,
  idempotencyKey: "review",
  expectedLatestVersion: 0,
  preview: {
    schema: "athyper.cycle-template/1.0" as const,
    template,
    templateHash: cycleTemplateHash(template),
    valid: true,
    issues: [],
    topologicalTaskIds: template.tasks.map((t) => t.id),
  },
};
describe.runIf(enabled)(
  "cycle repository tenant RLS (empty disposable database only)",
  () => {
    beforeAll(async () => {
      await sql
        .raw(
          "CREATE SCHEMA shared;CREATE SCHEMA control;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';CREATE ROLE cycle_review_app;CREATE TABLE control.cycle_type(id uuid PRIMARY KEY,tenant_id uuid NOT NULL);",
        )
        .execute(admin);
      const ddl = readFileSync(
        resolve(process.cwd(), "../../../db/ddl/common/control/03_tables.sql"),
        "utf8",
      );
      await sql
        .raw(
          ddl.match(
            /CREATE TABLE control\.cycle_template_revision \([\s\S]*?\n\);/,
          )![0],
        )
        .execute(admin);
      for (const table of ["cycle_type", "cycle_template_revision"])
        await sql
          .raw(
            `ALTER TABLE control.${table} ENABLE ROW LEVEL SECURITY;ALTER TABLE control.${table} FORCE ROW LEVEL SECURITY;CREATE POLICY tenant_guard ON control.${table} USING (tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid) WITH CHECK(tenant_id=nullif(current_setting('app.current_tenant_id',true),'')::uuid);`,
          )
          .execute(admin);
      await sql
        .raw(
          "GRANT USAGE ON SCHEMA shared,control TO cycle_review_app;GRANT SELECT ON control.cycle_type TO cycle_review_app;GRANT SELECT,INSERT ON control.cycle_template_revision TO cycle_review_app;",
        )
        .execute(admin);
      await sql`INSERT INTO control.cycle_type VALUES(${template.cycleType.id}::uuid,${tenant}::uuid)`.execute(
        admin,
      );
    });
    afterAll(async () => {
      await db.destroy();
      await admin.destroy();
    });
    it("publishes and reads with tenant RLS and no cycle-type UPDATE privilege", async () => {
      expect((await repo.publish(input)).kind).toBe("published");
      expect(
        (await repo.getPublished(tenant, template.cycleType.id))?.version,
      ).toBe(1);
      expect(
        await repo.externalPhaseExists(
          tenant,
          template.cycleType.id,
          template.phases[0]!.id,
        ),
      ).toBe(true);
      expect(await repo.cycleTypeExists(tenant, template.cycleType.id)).toBe(
        true,
      );
      expect(
        await repo.getPublished(actor, template.cycleType.id),
      ).toBeUndefined();
    });
    it("serializes version checks without UPDATE permission", async () => {
      const results = await Promise.all(
        ["a", "b"].map((idempotencyKey) =>
          repo.publish({ ...input, idempotencyKey, expectedLatestVersion: 1 }),
        ),
      );
      expect(results.map((r) => r.kind).sort()).toEqual([
        "published",
        "version_conflict",
      ]);
      expect((await repo.publish(input)).kind).toBe("replayed");
    });
    it("rejects cycles spread across revisions and removal of incoming references", async () => {
      const a = {
        ...structuredClone(template),
        crossDependencies: [...template.crossDependencies],
      };
      const b = {
        ...structuredClone(template),
        cycleType: { ...template.cycleType },
        crossDependencies: [...template.crossDependencies],
      };
      b.cycleType.id = "00000000-0000-4000-8000-000000000012";
      await sql`INSERT INTO control.cycle_type VALUES(${b.cycleType.id}::uuid,${tenant}::uuid)`.execute(
        admin,
      );
      const { expectedLatestVersion: _expected, ...base } = input;
      const publish = (draft: typeof a, key: string) =>
        repo.publish({
          ...base,
          idempotencyKey: key,
          preview: {
            ...input.preview,
            template: draft,
            templateHash: cycleTemplateHash(draft),
          },
        });
      await publish(b, "b-initial");
      a.crossDependencies = [
        {
          predecessorTypeId: a.cycleType.id,
          predecessorPhaseId: a.phases[0]!.id,
          successorTypeId: b.cycleType.id,
          successorPhaseId: b.phases[0]!.id,
          isHard: true,
        },
      ];
      b.crossDependencies = [
        {
          predecessorTypeId: b.cycleType.id,
          predecessorPhaseId: b.phases[0]!.id,
          successorTypeId: a.cycleType.id,
          successorPhaseId: a.phases[0]!.id,
          isHard: true,
        },
      ];
      // Both candidates pass independent local validation, but only one may commit.
      const results = await Promise.allSettled([
        publish(a, "a-edge"),
        publish(b, "b-edge"),
      ]);
      expect(
        results.filter((result) => result.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        results.filter((result) => result.status === "rejected"),
      ).toHaveLength(1);
      const loser = results[0]!.status === "rejected" ? a : b;
      const withoutPhase = { ...loser, phases: [], crossDependencies: [] };
      await expect(
        publish(withoutPhase, "remove-referenced-phase"),
      ).rejects.toMatchObject({ code: "CONTROL_ADMIN_CYCLE_TEMPLATE_INVALID" });
      expect(
        (await repo.getPublished(tenant, loser.cycleType.id))!.template.phases,
      ).toHaveLength(1);
    });
  },
);
