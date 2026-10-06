import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { expect, it } from "vitest";
import { nativeAiDdl } from "../../../../contracts/meta-entity-authoring/src/native-ai-ddl.js";
import {
  nativeAiMembers,
  nativeOperationMember,
  type NativeOperationRow,
  type NativeAiGraph,
  type NativeAiKind,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  planNativeAiGraph,
  planNativeOperationBranch,
  type StoredRow,
} from "./graph-reconciliation.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
import { writeReconciliationPlans } from "./scoped-graph-writer.js";
const enabled = process.env.ATHYPER_NATIVE_AI_RECONCILIATION_POSTGRES === "1";
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
/** Generated AI DDL and the real shared writer, in a disposable database.
 * Prerequisite tables/guard are synthetic: this is not cutover, host or deployed
 * qualification, and does not exercise a whole-source conversion command. */
it.skipIf(!enabled)(
  "preserves AI attribution through order swaps and rolls back an atomic multi-family failure",
  async () => {
    const name = "athyper-ai-reconcile-" + randomUUID();
    let created = false,
      db: Kysely<Record<string, never>> | undefined;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=native-ai-reconciliation-test",
        "-p",
        "127.0.0.1::5432",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm",
      );
      created = true;
      let ready = false;
      for (let i = 0; i < 100; i++) {
        try {
          docker(
            "exec",
            name,
            "pg_isready",
            "-h",
            "127.0.0.1",
            "-U",
            "postgres",
          );
          ready = true;
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      expect(ready).toBe(true);
      const { Pool } = createRequire(
        new URL("../../../../../db/package.json", import.meta.url),
      )("pg");
      db = new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: "127.0.0.1",
            port: Number(docker("port", name, "5432/tcp").split(":").at(-1)),
            user: "postgres",
            database: "postgres",
          }),
        }),
      });
      await sql
        .raw(
          `CREATE SCHEMA metadata;CREATE SCHEMA shared;
      CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';
      CREATE FUNCTION metadata.trg_guard_entity_graph_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
      CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY);`,
        )
        .execute(db);
      for (const table of [
        "entity_field",
        "entity_search_profile",
        "entity_operation",
        "entity_relation",
      ])
        await sql
          .raw(
            `CREATE TABLE metadata.${table}(id uuid PRIMARY KEY,change_set_id uuid NOT NULL REFERENCES metadata.entity_change_set(id),UNIQUE(change_set_id,id));`,
          )
          .execute(db);
      // Operation prerequisite columns are a descriptor-projected test schema,
      // not the canonical operation migration or its qualification guard.
      const operationColumns = Object.values(nativeOperationMember.columns).map(
        (col) =>
          "ADD COLUMN " +
          col.column +
          " " +
          (col.sqlType.startsWith("metadata.") ? "text" : col.sqlType),
      );
      await sql
        .raw(
          "ALTER TABLE metadata.entity_operation " +
            operationColumns
              .concat([
                "ADD COLUMN entity_id uuid",
                "ADD COLUMN tenant_id uuid",
                "ADD COLUMN created_by uuid",
                "ADD COLUMN created_at timestamptz DEFAULT clock_timestamp()",
                "ADD COLUMN updated_by uuid",
                "ADD COLUMN updated_at timestamptz",
                "ADD COLUMN protected_control boolean DEFAULT true",
              ])
              .join(","),
        )
        .execute(db);
      await sql.raw(nativeAiDdl()).execute(db);
      const draft = randomUUID(),
        other = randomUUID(),
        entity = randomUUID(),
        actor = randomUUID(),
        profile = randomUUID(),
        field1 = randomUUID(),
        field2 = randomUUID(),
        member1 = randomUUID(),
        member2 = randomUUID();
      await sql`INSERT INTO metadata.entity_change_set VALUES(${draft}::uuid),(${other}::uuid)`.execute(
        db,
      );
      await sql`INSERT INTO metadata.entity_field VALUES(${field1}::uuid,${draft}::uuid),(${field2}::uuid,${draft}::uuid)`.execute(
        db,
      );
      const c = {
        change_set_id: draft,
        entity_id: entity,
        tenant_id: null,
        created_by: actor,
      };
      const operation: NativeOperationRow = {
        id: randomUUID(),
        operationKey: "read",
        operationKind: "read",
        description: null,
        labelId: profile,
        auditEventCode: "fixture.read",
        executionMode: "synchronous",
        idempotencyMode: "none",
        inputSurfaceId: null,
        resultSurfaceId: null,
        authorizationTarget: "existing",
        authorizationEffect: "read",
        requiresParentRead: false,
        requiresPreflight: false,
        replacementOperationId: null,
        handlerKey: "registered.read",
        handlerVersion: 1,
        preflightKey: null,
        preflightVersion: null,
        extensionFieldMode: "none",
        exportFormats: null,
        exportMaxRecords: null,
      };
      const operationValues = { ...nativeOperationToStorage(operation), ...c };
      await sql`INSERT INTO metadata.entity_operation (${sql.join(Object.keys(operationValues).map((k) => sql.ref(k)))}) VALUES(${sql.join(Object.values(operationValues).map((v) => sql`${v}`))})`.execute(
        db,
      );
      const readOperation = async () =>
        (
          await sql<{
            value: StoredRow;
          }>`SELECT to_jsonb(t) || jsonb_build_object('export_max_records',t.export_max_records::text) AS value FROM metadata.entity_operation t WHERE id=${operation.id}::uuid`.execute(
            db!,
          )
        ).rows[0]!.value;
      const operationBefore = await readOperation();
      const graph: NativeAiGraph = {
        profile: [
          {
            id: profile,
            enabled: true,
            description: "Original",
            aliases: [],
            contextKinds: ["record"],
            searchProfileId: null,
            vocabularyLocale: null,
          },
        ],
        field: [
          {
            id: member1,
            aiProfileId: profile,
            entityFieldId: field1,
            position: 1,
          },
          {
            id: member2,
            aiProfileId: profile,
            entityFieldId: field2,
            position: 2,
          },
        ],
        binding: [],
        reference: [],
        term: [],
      };
      const empty = {
        profile: [],
        field: [],
        binding: [],
        reference: [],
        term: [],
      };
      await db
        .transaction()
        .execute(async (tx) =>
          writeReconciliationPlans(tx, planNativeAiGraph(graph, empty, 100), c),
        );
      const read = async () => {
        const stored = {} as Record<NativeAiKind, readonly StoredRow[]>;
        for (const kind of Object.keys(nativeAiMembers) as NativeAiKind[]) {
          stored[kind] = (
            await sql<{
              value: StoredRow;
            }>`SELECT to_jsonb(t) AS value FROM ${sql.table("metadata." + nativeAiMembers[kind].table)} t WHERE change_set_id=${draft}::uuid ORDER BY id`.execute(
              db!,
            )
          ).rows.map((r) => r.value);
        }
        return stored;
      };
      const before = await read();
      const edited: NativeAiGraph = {
        ...graph,
        profile: graph.profile.map((r) => ({ ...r, description: "Edited" })),
        field: graph.field.map((r) => ({ ...r, position: 3 - r.position })),
      };
      await db
        .transaction()
        .execute(async (tx) =>
          writeReconciliationPlans(
            tx,
            [
              planNativeOperationBranch(
                [{ ...operation, description: "Edited operation" }],
                [operationBefore],
              ),
              ...planNativeAiGraph(edited, before, 100),
            ],
            c,
          ),
        );
      const after = await read();
      const operationAfter = await readOperation();
      expect(operationAfter.description).toBe("Edited operation");
      expect(operationAfter.created_at).toBe(operationBefore.created_at);
      expect(operationAfter.created_by).toBe(operationBefore.created_by);
      expect(operationAfter.protected_control).toBe(
        operationBefore.protected_control,
      );
      for (const kind of ["profile", "field"] as const)
        for (const row of after[kind]) {
          const prior = before[kind].find((r) => r.id === row.id)!;
          expect(row.created_by).toBe(prior.created_by);
          expect(row.created_at).toBe(prior.created_at);
        }
      expect(after.profile[0]!.description).toBe("Edited");
      expect(after.field.find((r) => r.id === member1)!.position).toBe(2);
      expect(after.field.find((r) => r.id === member2)!.position).toBe(1);
      const invalid: NativeAiGraph = {
        ...edited,
        profile: edited.profile.map((r) => ({
          ...r,
          description: "Must rollback",
        })),
        binding: [
          {
            id: randomUUID(),
            aiProfileId: profile,
            bindingKind: "action",
            contractKey: "registered-action",
            contractVersion: 1,
            required: null,
            operationId: randomUUID(),
            position: 1,
          },
        ],
      };
      await expect(
        db
          .transaction()
          .execute(async (tx) =>
            writeReconciliationPlans(
              tx,
              [
                planNativeOperationBranch(
                  [{ ...operation, description: "Must rollback operation" }],
                  [operationAfter],
                ),
                ...planNativeAiGraph(invalid, after, 100),
              ],
              c,
            ),
          ),
      ).rejects.toThrow(/foreign key/);
      expect(await read()).toEqual(after);
      expect(await readOperation()).toEqual(operationAfter);
      await expect(
        db.transaction().execute(async (tx) =>
          writeReconciliationPlans(tx, planNativeAiGraph(graph, after, 100), {
            ...c,
            change_set_id: other,
          }),
        ),
      ).rejects.toMatchObject({ code: "AUTHORING_MEMBER_WRITE_DENIED" });
      expect(await read()).toEqual(after);
      // Real incoming FKs are inspected before removing an unselected dependent.
      await expect(
        db.transaction().execute(async (tx) =>
          writeReconciliationPlans(
            tx,
            [
              {
                table: "entity_ai_profile",
                insert: [],
                update: [],
                remove: after.profile,
              },
            ],
            c,
          ),
        ),
      ).rejects.toMatchObject({ code: "AUTHORING_MEMBER_DEPENDENCY" });
      expect(await read()).toEqual(after);
    } finally {
      await db?.destroy();
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
