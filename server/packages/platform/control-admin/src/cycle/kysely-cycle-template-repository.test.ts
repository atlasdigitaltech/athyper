import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
  type Dialect,
  type QueryResult,
} from "kysely";
import type { CycleTemplatePreview } from "@athyper/server-contract-control-admin";
import { describe, expect, it } from "vitest";
import { KyselyCycleTemplateRepository } from "./kysely-cycle-template-repository.js";
import { cycleTemplateHash } from "./cycle-config-service.js";
import { validTemplate } from "./cycle-test-fixtures.js";

const tenant = "00000000-0000-4000-8000-000000000001",
  actor = "00000000-0000-4000-8000-000000000099";
const template = validTemplate();
const preview: CycleTemplatePreview = {
  schema: "athyper.cycle-template/1.0",
  template,
  templateHash: cycleTemplateHash(template),
  valid: true,
  issues: [],
  topologicalTaskIds: template.tasks.map((task) => task.id),
};
const row = {
  id: "revision-1",
  tenant_id: tenant,
  revision_number: 1,
  template_json: preview,
  template_hash: preview.templateHash,
  published_at: "2026-09-07T00:00:00Z",
  published_by: actor,
};
const input = {
  tenantId: tenant,
  principalId: actor,
  idempotencyKey: "publish-1",
  expectedLatestVersion: 0,
  preview,
};
function fixture(rows: Array<Array<Record<string, unknown>>>) {
  const queries: CompiledQuery[] = [],
    contextQueries: CompiledQuery[] = [],
    events: string[] = [];
  const connection: DatabaseConnection = {
    async executeQuery<R>(query: CompiledQuery): Promise<QueryResult<R>> {
      if (
        query.sql.includes("set_config") ||
        query.sql.includes("pg_advisory_xact_lock")
      ) {
        contextQueries.push(query);
        return { rows: [] };
      }
      queries.push(query);
      const result = rows.shift();
      if (!result) throw new Error("Unexpected query");
      return { rows: result as R[] };
    },
    async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
      throw new Error("Streaming not used");
    },
  };
  const driver = new DummyDriver();
  driver.acquireConnection = async () => connection;
  driver.beginTransaction = async () => {
    events.push("begin");
  };
  driver.commitTransaction = async () => {
    events.push("commit");
  };
  driver.rollbackTransaction = async () => {
    events.push("rollback");
  };
  const dialect: Dialect = {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => driver,
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  };
  const db = new Kysely<Record<string, never>>({ dialect });
  return {
    repository: new KyselyCycleTemplateRepository(db),
    queries,
    contextQueries,
    events,
    close: () => db.destroy(),
  };
}
describe("cycle-template SQL persistence", () => {
  it("locks the tenant's cycle type before comparing versions and inserting a new immutable revision", async () => {
    const f = fixture([
      [{ id: template.cycleType.id }],
      [],
      [{ version: 0 }],
      [],
      [row],
    ]);
    try {
      await expect(f.repository.publish(input)).resolves.toMatchObject({
        kind: "published",
        value: { version: 1, tenantId: tenant },
      });
      expect(f.queries[0]!.sql).toMatch(
        /WHERE tenant_id=\$1::uuid AND id=\$2::uuid/,
      );
      expect(f.queries[0]!.parameters).toEqual([tenant, template.cycleType.id]);
      expect(f.contextQueries[0]!.parameters).toEqual([tenant, actor]);
      expect(
        f.contextQueries.some((q) => q.sql.includes("pg_advisory_xact_lock")),
      ).toBe(true);
      expect(f.queries[1]!.parameters).toEqual([
        tenant,
        template.cycleType.id,
        "publish-1",
      ]);
      expect(f.queries[4]!.sql).toMatch(
        /^INSERT INTO control.cycle_template_revision/,
      );
      expect(f.queries[4]!.parameters).toContain(preview.templateHash);
      expect(
        f.queries.some((query) => /^(UPDATE|DELETE)\b/.test(query.sql)),
      ).toBe(false);
      expect(f.events).toEqual(["begin", "commit"]);
    } finally {
      await f.close();
    }
  });
  it("replays the original revision before considering an obsolete expected version", async () => {
    const f = fixture([[{ id: template.cycleType.id }], [row]]);
    try {
      await expect(f.repository.publish(input)).resolves.toMatchObject({
        kind: "replayed",
        value: { version: 1 },
      });
      expect(f.queries).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
  it("rejects reuse of an idempotency key for different content and rolls back", async () => {
    const f = fixture([
      [{ id: template.cycleType.id }],
      [{ ...row, template_hash: "b".repeat(64) }],
    ]);
    try {
      await expect(f.repository.publish(input)).rejects.toMatchObject({
        code: "CONTROL_ADMIN_IDEMPOTENCY_CONFLICT",
        statusCode: 409,
      });
      expect(f.events).toEqual(["begin", "rollback"]);
      expect(f.queries).toHaveLength(2);
    } finally {
      await f.close();
    }
  });
  it("returns a version conflict without inserting", async () => {
    const f = fixture([[{ id: template.cycleType.id }], [], [{ version: 3 }]]);
    try {
      await expect(f.repository.publish(input)).resolves.toEqual({
        kind: "version_conflict",
        expectedVersion: 0,
        actualVersion: 3,
      });
      expect(f.queries).toHaveLength(3);
    } finally {
      await f.close();
    }
  });
  it("returns 404 when the tenant cycle type does not exist", async () => {
    const f = fixture([[]]);
    try {
      await expect(f.repository.publish(input)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(f.queries).toHaveLength(1);
      expect(f.events).toEqual(["begin", "rollback"]);
    } finally {
      await f.close();
    }
  });
  it("selects the latest tenant revision before expanding its phases", async () => {
    const f = fixture([[]]);
    try {
      await expect(
        f.repository.externalPhaseExists(
          tenant,
          template.cycleType.id,
          template.phases[0]!.id,
        ),
      ).resolves.toBe(false);
      const query = f.queries[0]!;
      expect(query.sql).toContain(
        "ORDER BY revision_number DESC LIMIT 1) revision CROSS JOIN LATERAL",
      );
      expect(query.sql).toContain(
        "WHERE tenant_id=$1::uuid AND cycle_type_id=$2::uuid",
      );
      expect(query.parameters).toEqual([
        tenant,
        template.cycleType.id,
        template.phases[0]!.id,
      ]);
    } finally {
      await f.close();
    }
  });
  it("scopes latest and explicit reads to the tenant and cycle type", async () => {
    const f = fixture([[row], [row]]);
    try {
      await expect(
        f.repository.getPublished(tenant, template.cycleType.id),
      ).resolves.toMatchObject({ version: 1 });
      await expect(
        f.repository.getPublished(tenant, template.cycleType.id, 1),
      ).resolves.toMatchObject({ version: 1 });
      expect(f.queries[0]!.parameters).toEqual([tenant, template.cycleType.id]);
      expect(f.queries[0]!.sql).toContain(
        "ORDER BY revision_number DESC LIMIT 1",
      );
      expect(f.queries[1]!.parameters).toEqual([
        tenant,
        template.cycleType.id,
        1,
      ]);
      expect(f.queries[1]!.sql).toContain("revision_number=$3");
    } finally {
      await f.close();
    }
  });
});
