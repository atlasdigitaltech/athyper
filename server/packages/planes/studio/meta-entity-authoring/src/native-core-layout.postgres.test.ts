import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { expect, it } from "vitest";
import {
  nativeCoreLayoutMembers,
  type NativeMetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { coreFixtureId } from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { normalizedCoreToStorage } from "./normalized-core-codec.js";
import { normalizedLayoutToStorage } from "./normalized-layout-codec.js";
import { loadNormalizedCoreLayout } from "./normalized-core-layout-storage.js";
import {
  saveNativeCoreLayoutCommands,
  type NativeAuthoringPolicy,
} from "./native-core-layout-persistence.js";
const enabled = process.env.ATHYPER_NATIVE_GRAPH_POSTGRES === "1";
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
/** Synthetic target schema from F0 projections. This proves native SQL execution,
 * not canonical schema migration, RLS/product grants, approved host or live reads.
 * Its guard/advance functions are test doubles in a disposable database only. */
it.skipIf(!enabled)(
  "persists native SQL rows, revisions, snapshots and receipts atomically",
  async () => {
    const name = `athyper-native-sql-${randomUUID()}`;
    let created = false,
      db: Kysely<Record<string, never>> | undefined;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=native-sql-test",
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
      for (let n = 0; n < 100; n++) {
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
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      expect(ready).toBe(true);
      const port = Number(docker("port", name, "5432/tcp").split(":").at(-1));
      const { Pool } = createRequire(
        new URL("../../../../../db/package.json", import.meta.url),
      )("pg");
      db = new Kysely({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: "127.0.0.1",
            port,
            user: "postgres",
            database: "postgres",
            max: 3,
          }),
        }),
      });
      await sql
        .raw(
          `CREATE SCHEMA metadata; CREATE SCHEMA snapshot;
      CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid NOT NULL,tenant_id uuid,status text NOT NULL,lock_version bigint NOT NULL,native_core_layout_version integer,authoring_schema_hash text,source_kind text,reference_contract_version integer,default_locale text);
      CREATE TABLE metadata.entity_authoring_command_receipt(change_set_id uuid NOT NULL,tenant_id uuid,actor_id uuid NOT NULL,idempotency_key text NOT NULL,request_hash text NOT NULL,expected_revision bigint NOT NULL,revision bigint NOT NULL,changed boolean NOT NULL,identities jsonb NOT NULL,UNIQUE(change_set_id,idempotency_key));
      CREATE TABLE snapshot.entity_draft_save(change_set_id uuid NOT NULL,lock_version bigint NOT NULL,tenant_id uuid,graph jsonb NOT NULL,graph_hash text NOT NULL,captured_by uuid NOT NULL,capture_kind text NOT NULL,UNIQUE(change_set_id,lock_version));
      CREATE FUNCTION metadata.fn_assert_native_authoring_contract(uuid,text) RETURNS void LANGUAGE sql AS 'SELECT NULL::void';
      CREATE FUNCTION metadata.fn_advance_entity_change_set(uuid,bigint,uuid) RETURNS bigint LANGUAGE plpgsql AS $$ DECLARE v bigint; BEGIN UPDATE metadata.entity_change_set SET lock_version=lock_version+1 WHERE id=$1 AND lock_version=$2 AND status IN ('draft','rejected') RETURNING lock_version INTO v; IF v IS NULL THEN RAISE EXCEPTION 'revision conflict'; END IF; RETURN v; END $$;`,
        )
        .execute(db);
      for (const d of Object.values(nativeCoreLayoutMembers)) {
        await sql
          .raw(
            `CREATE TABLE metadata.${d.table}(id uuid PRIMARY KEY,change_set_id uuid NOT NULL,entity_id uuid NOT NULL,tenant_id uuid,created_by uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),updated_by uuid,updated_at timestamptz,${Object.values(
              d.columns,
            )
              .map((c) => `${c.column} ${c.sqlType}`)
              .join(",")});`,
          )
          .execute(db);
      }
      await sql.raw("CREATE SCHEMA shared").execute(db);
      await sql
        .raw(
          readFileSync(
            new URL(
              "../../../../../db/ddl/common/shared/01_bootstrap.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        )
        .execute(db);
      const tables = new Set(
        Object.values(nativeCoreLayoutMembers).map((d) => d.table),
      );
      for (const d of Object.values(nativeCoreLayoutMembers))
        for (const col of Object.values(d.columns))
          if (col.reference && tables.has(col.reference))
            await sql
              .raw(
                `ALTER TABLE metadata.${d.table} ADD FOREIGN KEY (${col.column}) REFERENCES metadata.${col.reference}(id)`,
              )
              .execute(db);
      const scope = {
        changeSetId: coreFixtureId(101),
        entityId: coreFixtureId(100),
        tenantId: null,
      };
      const actor = coreFixtureId(102),
        hash = "b".repeat(64),
        c = layoutFixtureContext();
      await sql`INSERT INTO metadata.entity_change_set VALUES(${scope.changeSetId}::uuid,${scope.entityId}::uuid,NULL,'draft',4,1,${hash},'product',1,'en')`.execute(
        db,
      );
      for (const [kind, d] of Object.entries(nativeCoreLayoutMembers)) {
        const rows =
          kind === "section" || kind === "binding"
            ? layoutFixture()[kind]
            : c.core[kind as keyof typeof c.core];
        for (const row of rows) {
          const mapped =
            kind === "section" || kind === "binding"
              ? normalizedLayoutToStorage(kind, row as never)
              : normalizedCoreToStorage(
                  kind as keyof typeof c.core,
                  row as never,
                );
          const stored = {
            ...mapped,
            change_set_id: scope.changeSetId,
            entity_id: scope.entityId,
            tenant_id: null,
            created_by: actor,
          };
          await sql`INSERT INTO ${sql.table("metadata." + d.table)} (${sql.join(Object.keys(stored).map((k) => sql.ref(k)))}) VALUES(${sql.join(Object.values(stored).map((v) => sql`${v}`))})`.execute(
            db,
          );
        }
      }
      const graph = async (
        tx: Transaction<Record<string, never>>,
      ): Promise<NativeMetaEntityGraph> => {
        const state = await loadNormalizedCoreLayout(tx, scope);
        return {
          contractSchema: "athyper.meta-entity-contract/2.4",
          authoringSource: {
            entityId: scope.entityId,
            tenantId: null,
            sourceKind: "product",
            authoringSchemaHash: hash,
          },
          entity: {
            entityCode: "synthetic_reference",
            entityClass: "master",
            ownershipModel: "system",
          },
          fields: state.core.field,
          runtimeProfiles: state.core.runtime,
          surfaces: state.core.surface,
          surfaceSections: state.layout.section,
          surfaceFieldBindings: state.layout.binding,
          operations: [],
        };
      };
      const policy: NativeAuthoringPolicy = {
        commands: {
          maxBatchBytes: 100_000,
          maxCommands: 30,
          maxMembers: 100,
          authoringSchemaHash: hash,
        },
        admit: async () => {},
        resolveContext: async () => c,
        resolveInitializer: async () => {
          throw Error("New initialization is not qualified in this fixture");
        },
      };
      const input = {
        ...scope,
        actorId: actor,
        batch: {
          contract: "entity.authoring-native-core-layout-commands/1",
          expectedRevision: 4,
          idempotencyKey: "native-sql-save-0001",
          commands: [
            {
              kind: "updateMember",
              memberKind: "field",
              id: coreFixtureId(2),
              set: { description: "Readable code" },
              clear: [],
            },
            {
              kind: "updateMember",
              memberKind: "runtime",
              id: coreFixtureId(20),
              set: { readMode: "none", apiExposure: "catalog_only" },
              clear: [],
            },
            {
              kind: "updateMember",
              memberKind: "surface",
              id: coreFixtureId(41),
              set: { columnCount: 3 },
              clear: [],
            },
            {
              kind: "updateMember",
              memberKind: "section",
              id: coreFixtureId(60),
              set: { columnCount: 3 },
              clear: [],
            },
            {
              kind: "updateMember",
              memberKind: "binding",
              id: coreFixtureId(61),
              set: { columnSpan: 2 },
              clear: [],
            },
          ],
        },
      };
      const before = (
        await sql<{
          id: string;
          created_by: string;
          created_at: string;
        }>`SELECT id,created_by,created_at::text FROM metadata.entity_field ORDER BY id`.execute(
          db,
        )
      ).rows;
      const save = (payload = input) =>
        db!
          .transaction()
          .execute((tx) =>
            saveNativeCoreLayoutCommands(tx, payload, policy, () => graph(tx)),
          );
      const result = await save();
      expect(result).toMatchObject({ revision: 5, changed: true });
      expect(await save()).toEqual(result);
      expect(
        (
          await sql`SELECT id,created_by,created_at::text FROM metadata.entity_field ORDER BY id`.execute(
            db,
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await sql<{
            n: string;
          }>`SELECT count(*)::text AS n FROM snapshot.entity_draft_save`.execute(
            db,
          )
        ).rows[0]!.n,
      ).toBe("2");
      const after = await db.transaction().execute(graph);
      expect(
        after.fields.find((f) => f.id === coreFixtureId(2))!.description,
      ).toBe("Readable code");
      expect(after.surfaceFieldBindings[0]!.columnSpan).toBe(2);
      await expect(
        save({
          ...input,
          batch: { ...input.batch, idempotencyKey: "native-sql-stale-0001" },
        }),
      ).rejects.toMatchObject({ code: "AUTHORING_REVISION_CONFLICT" });
      await expect(
        db.transaction().execute(async (tx) => {
          const next = {
            ...input,
            batch: {
              ...input.batch,
              expectedRevision: 5,
              idempotencyKey: "native-sql-rollback-0001",
              commands: [
                {
                  kind: "updateMember",
                  memberKind: "field",
                  id: coreFixtureId(2),
                  set: { description: "Must rollback" },
                  clear: [],
                },
              ],
            },
          };
          await saveNativeCoreLayoutCommands(tx, next, policy, () => graph(tx));
          throw Error("deliberate rollback");
        }),
      ).rejects.toThrow("deliberate rollback");
      expect(await db.transaction().execute(graph)).toEqual(after);
      expect(
        (
          await sql`SELECT revision FROM metadata.entity_authoring_command_receipt WHERE idempotency_key='native-sql-rollback-0001'`.execute(
            db,
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await sql<{
            v: string;
          }>`SELECT lock_version::text AS v FROM metadata.entity_change_set WHERE id=${scope.changeSetId}::uuid`.execute(
            db,
          )
        ).rows[0]!.v,
      ).toBe("5");
      expect(
        (
          await sql<{
            n: string;
          }>`SELECT count(*)::text AS n FROM snapshot.entity_draft_save`.execute(
            db,
          )
        ).rows[0]!.n,
      ).toBe("2");
      const storedBinding = after.surfaceFieldBindings[0]!;
      const {
        id: bindingId,
        overlayId: _overlay,
        ...bindingValue
      } = storedBinding;
      const insertionPolicy: NativeAuthoringPolicy = {
        ...policy,
        resolveInitializer: async () => (kind) => {
          if (kind !== "binding")
            throw Error("Unqualified initialization family");
          return { overlayId: null }; // Registered synthetic fixture source, never operation initialization.
        },
      };
      const replacement = {
        ...input,
        batch: {
          ...input.batch,
          expectedRevision: 5,
          idempotencyKey: "native-sql-replace-0001",
          commands: [
            { kind: "removeMember", memberKind: "binding", id: bindingId },
            {
              kind: "addMember",
              memberKind: "binding",
              tempRef: "replacement",
              value: bindingValue,
            },
          ],
        },
      };
      await expect(
        db
          .transaction()
          .execute((tx) =>
            saveNativeCoreLayoutCommands(tx, replacement, insertionPolicy, () =>
              graph(tx),
            ),
          ),
      ).rejects.toMatchObject({
        code: "AUTHORING_MEMBER_IDENTITY_REPLACEMENT",
      });
      bindingValue.bindingKey = "code_secondary";
      const replaced = await db
        .transaction()
        .execute((tx) =>
          saveNativeCoreLayoutCommands(tx, replacement, insertionPolicy, () =>
            graph(tx),
          ),
        );
      expect(replaced.revision).toBe(6);
      expect(replaced.identities.replacement).toMatch(/^[0-9a-f-]{14}7/);
      const final = await db.transaction().execute(graph);
      expect(final.surfaceFieldBindings[0]!.id).toBe(
        replaced.identities.replacement,
      );
      expect(final.surfaceFieldBindings[0]!.id).not.toBe(bindingId);
      expect(
        await db
          .transaction()
          .execute((tx) =>
            saveNativeCoreLayoutCommands(tx, replacement, insertionPolicy, () =>
              graph(tx),
            ),
          ),
      ).toEqual(replaced);
      await expect(
        db.transaction().execute((tx) =>
          saveNativeCoreLayoutCommands(
            tx,
            {
              ...input,
              batch: {
                ...input.batch,
                expectedRevision: 6,
                idempotencyKey: "native-sql-dependent-0001",
                commands: [
                  {
                    kind: "removeMember",
                    memberKind: "field",
                    id: coreFixtureId(2),
                  },
                ],
              },
            },
            policy,
            () => graph(tx),
          ),
        ),
      ).rejects.toThrow();
      expect(await db.transaction().execute(graph)).toEqual(final);
    } finally {
      await db?.destroy();
      if (created) docker("rm", "-f", name);
    }
  },
  60_000,
);
