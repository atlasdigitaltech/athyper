/** Isolated disposable PostgreSQL database; no application records are modified. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  type CompiledQuery,
  type DatabaseConnection,
} from "kysely";
import { describe, it, expect } from "vitest";
import { createKyselyRecordRepository } from "../kysely-record-repository.js";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { RecordRepositoryListInput } from "@athyper/server-contract-records";
if (
  process.env["ENTITY_VIEW_POSTGRES_TEST"] === "1" &&
  !process.env["ATHYPER_ENTITY_VIEW_TEST_CONTAINER"]
)
  throw new Error("An explicitly owned disposable container is required");
const enabled = process.env["ENTITY_VIEW_POSTGRES_TEST"] === "1";
const tenant = "11111111-1111-4111-8111-111111111111",
  principal = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333";
const literal = (value: unknown) =>
  value === null
    ? "NULL"
    : typeof value === "number"
      ? String(value)
      : "'" + String(value).replaceAll("'", "''") + "'";
function psql(database: string, sql: string) {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-u",
      "postgres",
      process.env["ATHYPER_ENTITY_VIEW_TEST_CONTAINER"]!,
      "psql",
      "-X",
      "-q",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      database,
      "-At",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
}
describe.skipIf(!enabled)(
  "standard view PostgreSQL complete-result semantics",
  () => {
    it("paginates 137 documents, deduplicates tasks and respects actor, tenant, status and request evidence", async () => {
      const name = "entity_view_test_" + randomUUID().replaceAll("-", "");
      psql("postgres", `CREATE DATABASE ${name}`);
      let db: Kysely<Record<string, never>> | undefined;
      try {
        psql(
          name,
          `CREATE SCHEMA document; CREATE SCHEMA master; CREATE SCHEMA snapshot;
    CREATE TABLE document.entity_case(id uuid PRIMARY KEY,tenant_id uuid,operation_code text,current_snapshot_id uuid,status text);
    CREATE TABLE document.work_item(tenant_id uuid,source_entity_code text,source_entity_id uuid,work_type_code text,assignee_principal_id uuid,claimant_principal_id uuid,assignee_team_id uuid,status text,available_at timestamptz,payload jsonb);
    CREATE TABLE document.workflow_request(id uuid,tenant_id uuid,entity_type text,entity_id text,definition_code text,workflow_type text,status text);
    CREATE TABLE master.team_member(tenant_id uuid,team_id uuid,principal_id uuid,joined_at timestamptz,left_at timestamptz);
    CREATE TABLE document.entity_case_command_evidence(tenant_id uuid,entity_case_id uuid,command_code text,outcome text,recorded_by uuid,before_version int);
    CREATE TABLE snapshot.entity_snapshot(tenant_id uuid,snapshot_id uuid,payload_json jsonb);
    INSERT INTO document.entity_case SELECT md5(n::text)::uuid,'${tenant}','new_record',md5(n::text)::uuid,'draft' FROM generate_series(1,143)n;
    INSERT INTO document.workflow_request SELECT id,tenant_id,'case_document',id::text,'review.flow','approval','pending' FROM document.entity_case;
    INSERT INTO document.work_item SELECT tenant_id,'case_document',id,'case.approval','${principal}',NULL,NULL,'open',now()-interval '1 day',jsonb_build_object('workflowRequestId',id::text) FROM document.entity_case;
    INSERT INTO document.work_item SELECT * FROM document.work_item WHERE source_entity_id=md5('1')::uuid;
    UPDATE document.work_item SET assignee_principal_id='${other}' WHERE source_entity_id=md5('138')::uuid;
    UPDATE document.work_item SET claimant_principal_id='${other}' WHERE source_entity_id=md5('139')::uuid;
    UPDATE document.work_item SET status='completed' WHERE source_entity_id=md5('140')::uuid;
    UPDATE document.work_item SET available_at=now()+interval '1 day' WHERE source_entity_id=md5('141')::uuid;
    UPDATE document.work_item SET tenant_id='${other}' WHERE source_entity_id=md5('142')::uuid;
    UPDATE document.workflow_request SET status='approved' WHERE id=md5('143')::uuid;
    INSERT INTO document.entity_case_command_evidence SELECT tenant_id,id,'entity.case.draft.write','accepted','${principal}',0 FROM document.entity_case;
    UPDATE document.entity_case_command_evidence SET before_version=1 WHERE entity_case_id=md5('1')::uuid;
    INSERT INTO document.entity_case_command_evidence SELECT tenant_id,id,'entity.case.submit','accepted','${principal}',2 FROM document.entity_case WHERE id=md5('2')::uuid;
    INSERT INTO snapshot.entity_snapshot SELECT tenant_id,id,jsonb_build_object('requestedRole','supplier') FROM document.entity_case;
   `,
        );
        psql(
          name,
          `CREATE ROLE ci_entity_view_reader NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA document,master,snapshot TO ci_entity_view_reader; GRANT SELECT ON ALL TABLES IN SCHEMA document,master,snapshot TO ci_entity_view_reader`,
        );
        expect(
          psql(
            name,
            "SET ROLE ci_entity_view_reader; SELECT NOT rolsuper AND NOT rolbypassrls FROM pg_roles WHERE rolname=current_user",
          ),
        ).toBe("t");
        class Driver extends DummyDriver {
          override async acquireConnection(): Promise<DatabaseConnection> {
            return {
              executeQuery: async <R>(query: CompiledQuery) => {
                const statement = query.sql.replace(/\$(\d+)/g, (_, index) =>
                  literal(query.parameters[Number(index) - 1]),
                );
                return {
                  rows: JSON.parse(
                    psql(
                      name,
                      `SET ROLE ci_entity_view_reader; SELECT COALESCE(json_agg(row_to_json(result)),'[]') FROM (${statement}) result`,
                    ),
                  ) as R[],
                };
              },
              streamQuery: async function* <R>() {
                yield { rows: [] as R[] };
              },
            };
          }
        }
        db = new Kysely({
          dialect: {
            createDriver: () => new Driver(),
            createAdapter: () => new PostgresAdapter(),
            createIntrospector: (db) => new PostgresIntrospector(db),
            createQueryCompiler: () => new PostgresQueryCompiler(),
          },
        });
        const descriptor = {
          schema: "athyper.entity-runtime-descriptor/1.0",
          entityCode: "any_case_list",
          planeKey: "neon",
          releaseId: "release",
          releaseNo: 1,
          contractHash: "a".repeat(64),
          compiledHash: "b".repeat(64),
          storage: {
            schema: "document",
            object: "entity_case",
            idField: "id",
            tenantField: "tenant_id",
          },
          fields: [
            { key: "id", storagePath: "id" },
            { key: "status", storagePath: "status" },
          ],
          operations: {},
        } as unknown as EntityRuntimeDescriptor;
        const repository = createKyselyRecordRepository({
          databases: { neon: db },
        });
        const input = {
          descriptor,
          tenantId: tenant,
          limit: 25,
          filters: [],
          sort: [{ field: "id", direction: "desc" }],
          countMode: "exact",
          projection: ["id", "status"],
          collectionScope: [],
          cursorScope: "test",
          viewRelationships: [
            {
              kind: "workflow.actionable_documents.v1",
              principalId: principal,
              sourceEntityCode: "case_document",
              workflowKeys: ["review.flow"],
              workTypeCodes: ["case.approval"],
              link: "workflow_request",
            },
          ],
        } as RecordRepositoryListInput;
        const ids: string[] = [];
        let cursor: string | undefined;
        do {
          const page = await repository.list({
            ...input,
            ...(cursor ? { cursor } : {}),
          });
          expect(page.pagination.total).toBe(137);
          ids.push(...page.data.map((row) => String(row["id"])));
          cursor = page.pagination.nextCursor;
        } while (cursor);
        expect(ids).toHaveLength(137);
        expect(new Set(ids).size).toBe(137);
        const grouped = await repository.list({ ...input, group: "status" });
        expect(grouped.groups).toEqual([{ value: "draft", count: 137 }]);
        const mine = await repository.list({
          ...input,
          viewRelationships: [
            {
              kind: "document.case_requests.v1",
              principalId: principal,
              role: { field: "requestedRole", values: ["supplier"] },
            },
          ],
        });
        expect(mine.pagination.total).toBe(142);
        const otherActor = await repository.list({
          ...input,
          viewRelationships: [
            { ...input.viewRelationships![0]!, principalId: other },
          ],
        });
        expect(otherActor.pagination.total).toBe(2);
        const empty = await repository.list({
          ...input,
          viewRelationships: [
            {
              ...input.viewRelationships![0]!,
              principalId: "44444444-4444-4444-8444-444444444444",
            },
          ],
        });
        expect(empty.data).toEqual([]);
        expect(empty.pagination.total).toBe(0);
        const first = await repository.list(input);
        await expect(
          repository.list({
            ...input,
            cursor: first.pagination.nextCursor!,
            viewRelationships: [
              { ...input.viewRelationships![0]!, principalId: other },
            ],
          }),
        ).rejects.toThrow();
      } finally {
        await db?.destroy();
        psql("postgres", `DROP DATABASE ${name}`);
      }
    }, 30000);
  },
);
