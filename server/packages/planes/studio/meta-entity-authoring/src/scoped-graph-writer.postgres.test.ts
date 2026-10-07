import express from "express";
import type { AddressInfo } from "node:net";
import { registerProductLabelEnrollmentRoutes } from "./product-label-enrollment-routes.js";
import { BRANCH_COLUMNS } from "./graph-storage-columns.js";
import { createProductLabelEnrollment } from "./product-label-enrollment.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  createProductCommandAuthority,
  enterProductCommand,
  withProductCommandAuthority,
} from "./product-command-authority.js";
import { sha256 } from "./deterministic.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
// Synthetic admission only; this disposable superuser fixture cannot qualify product RLS.
const fixtureProductHost = {
  admit: async () => {},
} as unknown as NativeAuthoringPolicy;
import {
  referenceFixture,
  referenceFixtureAnchors,
  fixtureId,
  referencePayload,
} from "./reference-command.fixtures.js";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql } from "kysely";
import { expect, it } from "vitest";
import {
  readReconciliationPlans,
  writeReconciliationPlans,
  type GraphCoordinate,
} from "./scoped-graph-writer.js";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { changed, type GraphTable } from "./graph-reconciliation.js";

import {
  layoutFixture,
  layoutFixtureContext,
} from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { prepareNormalizedCoreLayoutSave } from "./normalized-core-layout-storage.js";
const enabled = process.env.ATHYPER_SCOPED_GRAPH_POSTGRES === "1";
const read = (path: string) =>
  readFileSync(
    new URL(`../../../../../db/${path}`, import.meta.url),
    "utf8",
  ).replace(/^\uFEFF/, "");
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
// Disposable SQL-engine proof using actual metadata tables, indexes and graph
// guards. It deliberately does not attest deployed RLS, human review or live reads.
it.skipIf(!enabled)(
  "reconciles real PostgreSQL rows atomically with stable attribution, ordered swaps and defaults",
  async () => {
    const name = `athyper-scoped-save-${randomUUID()}`;
    const image =
      process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm";
    let db: Kysely<Record<string, never>> | undefined;
    let created = false;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=scoped-save-test",
        "-p",
        "127.0.0.1::5432",
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        image,
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
          `CREATE SCHEMA metadata; CREATE SCHEMA shared;
      CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';`,
        )
        .execute(db);
      await sql
        .raw(read("ddl/planes/studio/metadata/02_domains.sql"))
        .execute(db);
      // Start with the old immediate-order constraints, then rehearse the actual forward migration.
      await sql
        .raw(
          read("ddl/planes/studio/metadata/03_tables.sql").replaceAll(
            " DEFERRABLE INITIALLY IMMEDIATE",
            "",
          ),
        )
        .execute(db);
      await sql
        .raw(read("ddl/planes/studio/metadata/06_indexes.sql"))
        .execute(db);
      const functions = read("ddl/planes/studio/metadata/07_functions.sql");
      for (const functionName of [
        "current_actor_id",
        "fn_advance_entity_change_set",
        "trg_guard_entity_graph_row",
        "fn_validate_entity_graph",
      ]) {
        const start = functions.indexOf(
          `CREATE OR REPLACE FUNCTION metadata.${functionName}(`,
        );
        const end =
          functions.indexOf("$$;", functions.indexOf("AS $$", start)) + 3;
        await sql.raw(functions.slice(start, end)).execute(db);
      }
      const sharedFunctions = read("ddl/common/shared/07_functions.sql");
      const stampStart = sharedFunctions.indexOf(
        "CREATE OR REPLACE FUNCTION shared.trg_set_updated_at()",
      );
      await sql
        .raw(
          sharedFunctions.slice(
            stampStart,
            sharedFunctions.indexOf(
              "$$;",
              sharedFunctions.indexOf("AS $$", stampStart),
            ) + 3,
          ),
        )
        .execute(db);
      await sql
        .raw(
          "CREATE TRIGGER stamp BEFORE UPDATE ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()",
        )
        .execute(db);
      // Real guard enforces immutable identity/creation and transaction token.
      await sql
        .raw(
          `CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_field FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('field_key');
      CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_search_profile FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('search_key');
      CREATE TRIGGER graph_guard BEFORE INSERT OR UPDATE OR DELETE ON metadata.entity_search_field FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_graph_row('entity_search_profile_id','entity_field_id');
      ALTER TABLE metadata.entity_search_field ADD FOREIGN KEY(entity_search_profile_id) REFERENCES metadata.entity_search_profile(id) ON DELETE CASCADE;
      ALTER TABLE metadata.entity_search_field ADD FOREIGN KEY(entity_field_id) REFERENCES metadata.entity_field(id) ON DELETE RESTRICT;`,
        )
        .execute(db);
      const c: GraphCoordinate = {
        tenant_id: null,
        entity_id: randomUUID(),
        change_set_id: randomUUID(),
        created_by: randomUUID(),
      };
      const original = randomUUID(),
        fieldA = randomUUID(),
        fieldB = randomUUID(),
        searchA = randomUUID(),
        searchB = randomUUID(),
        bindingA = randomUUID(),
        bindingB = randomUUID();
      await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by) VALUES(${c.change_set_id}::uuid,${c.entity_id}::uuid,'fixture','Scoped writer fixture',${original}::uuid)`.execute(
        db,
      );
      const save = async (
        revision: number,
        branches: [GraphTable, readonly object[] | undefined][],
      ) =>
        db!.transaction().execute(async (tx) => {
          await sql`SELECT id FROM metadata.entity_change_set WHERE id=${c.change_set_id}::uuid FOR UPDATE`.execute(
            tx,
          );
          const plans = await readReconciliationPlans(
            tx,
            c.change_set_id,
            branches,
          );
          if (!plans.some(changed)) return;
          await sql`SELECT metadata.fn_advance_entity_change_set(${c.change_set_id}::uuid,${revision},${c.created_by}::uuid)`.execute(
            tx,
          );
          await writeReconciliationPlans(tx, plans, c);
        });
      const field = (id: string, key: string) => ({
        id,
        fieldKey: key,
        description: "Original",
        dataType: "string",
        typeConfig: { kind: "string" },
        valueOrigin: "stored",
        storagePath: key,
      });
      const fields = [field(fieldA, "code"), field(fieldB, "name")];
      const profiles = [
        {
          id: searchA,
          searchKey: "first",
          searchKind: "keyword",
          isDefault: true,
        },
        {
          id: searchB,
          searchKey: "second",
          searchKind: "keyword",
          isDefault: false,
        },
      ];
      const bindings = [
        {
          id: bindingA,
          entitySearchProfileId: searchA,
          entityFieldId: fieldA,
          position: 1,
          matchMode: "prefix",
        },
        {
          id: bindingB,
          entitySearchProfileId: searchA,
          entityFieldId: fieldB,
          position: 2,
          matchMode: "prefix",
        },
      ];
      await save(0, [
        ["entity_field", fields],
        ["entity_search_profile", profiles],
        ["entity_search_field", bindings],
      ]);
      const row = async () =>
        (
          await sql<
            Record<string, unknown>
          >`SELECT * FROM metadata.entity_field WHERE id=${fieldA}::uuid`.execute(
            db!,
          )
        ).rows[0]!;
      const before = await row();
      c.created_by = randomUUID(); // A different author performs subsequent edits.
      const swapped = bindings.map((row) => ({
        ...row,
        position: 3 - row.position,
      }));
      await expect(
        save(1, [["entity_search_field", swapped]]),
      ).rejects.toMatchObject({ code: "AUTHORING_ORDER_MIGRATION_REQUIRED" });
      await sql
        .raw(read("migrations/20261006_entity_scoped_order_constraints.sql"))
        .execute(db);
      await save(1, [
        [
          "entity_field",
          [{ ...fields[0], description: "Changed" }, fields[1]!],
        ],
        [
          "entity_search_profile",
          profiles.map((row) => ({ ...row, isDefault: !row.isDefault })),
        ],
        ["entity_search_field", swapped],
      ]);
      const after = await row();
      expect(after.id).toBe(before.id);
      expect(after.created_by).toBe(before.created_by);
      expect(after.created_at).toEqual(before.created_at);
      expect(after.updated_by).toBe(c.created_by);
      expect(after.updated_by).not.toBe(after.created_by);
      expect(after.description).toBe("Changed");
      expect(
        (
          await sql<{
            id: string;
          }>`SELECT id FROM metadata.entity_search_profile WHERE is_default`.execute(
            db,
          )
        ).rows[0]?.id,
      ).toBe(searchB);
      expect(
        (
          await sql<{
            position: number;
          }>`SELECT position FROM metadata.entity_search_field WHERE id=${bindingA}::uuid`.execute(
            db,
          )
        ).rows[0]?.position,
      ).toBe(2);
      // Genuine no-op makes no new revision or updated attribution.
      await save(2, [
        [
          "entity_field",
          [{ ...fields[0], description: "Changed" }, fields[1]!],
        ],
      ]);
      expect(await row()).toEqual(after);
      expect(
        (
          await sql<{
            lock_version: string;
          }>`SELECT lock_version FROM metadata.entity_change_set WHERE id=${c.change_set_id}::uuid`.execute(
            db,
          )
        ).rows[0]?.lock_version,
      ).toBe("2");
      // Two final defaults reject and restore the prior revision + memberships.
      await expect(
        save(2, [
          [
            "entity_search_profile",
            profiles.map((row) => ({ ...row, isDefault: true })),
          ],
        ]),
      ).rejects.toMatchObject({ code: "23505" });
      expect(
        (
          await sql<{
            id: string;
          }>`SELECT id FROM metadata.entity_search_profile WHERE is_default`.execute(
            db,
          )
        ).rows,
      ).toEqual([{ id: searchB }]);
      // Retained children prevent implicit CASCADE; explicitly removing them succeeds.
      await expect(
        save(2, [["entity_search_profile", []]]),
      ).rejects.toMatchObject({ code: "AUTHORING_MEMBER_DEPENDENCY" });
      await save(2, [
        ["entity_search_profile", []],
        ["entity_search_field", []],
      ]);
      expect(
        (await sql`SELECT * FROM metadata.entity_search_field`.execute(db))
          .rows,
      ).toEqual([]);
      // Concurrent same-revision edits: one succeeds, the stale one rolls back.
      const outcomes = await Promise.allSettled(
        ["One", "Two"].map((description) =>
          save(3, [
            ["entity_field", [{ ...fields[0], description }, fields[1]!]],
          ]),
        ),
      );
      expect(
        outcomes.filter((outcome) => outcome.status === "fulfilled"),
      ).toHaveLength(1);
      expect(
        outcomes.filter((outcome) => outcome.status === "rejected"),
      ).toHaveLength(1);
      expect((await row()).created_at).toEqual(before.created_at);
      // Exercise the actual repository, including immutable snapshots and no-op revision behavior.
      await sql
        .raw(
          "CREATE SCHEMA control; CREATE TABLE control.policy_definition(id uuid PRIMARY KEY,status text); CREATE SCHEMA snapshot;",
        )
        .execute(db);
      const snapshotDdl = read("ddl/planes/studio/snapshot/03_tables.sql");
      const snapshotStart = snapshotDdl.indexOf(
        "CREATE TABLE snapshot.entity_draft_save (",
      );
      await sql
        .raw(
          snapshotDdl.slice(
            snapshotStart,
            snapshotDdl.indexOf("\n);", snapshotStart) + 3,
          ),
        )
        .execute(db);
      await sql
        .raw(
          `CREATE FUNCTION snapshot.guard_entity_draft_save() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Draft save history is immutable'; END; $$;
      CREATE TRIGGER immutable BEFORE UPDATE OR DELETE ON snapshot.entity_draft_save FOR EACH ROW EXECUTE FUNCTION snapshot.guard_entity_draft_save();`,
        )
        .execute(db);
      const entityId = randomUUID(),
        draftId = randomUUID();
      await sql`INSERT INTO metadata.entity(id,module_id,entity_code,entity_class,ownership_model,created_by)
      VALUES(${entityId}::uuid,${randomUUID()}::uuid,'reference_probe','reference','system',${original}::uuid)`.execute(
        db,
      );
      await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by)
      VALUES(${draftId}::uuid,${entityId}::uuid,'probe','Repository probe',${original}::uuid)`.execute(
        db,
      );
      const repository = new KyselyMetaEntityAuthoringRepository(db);
      const graph: MetaEntityGraph = {
        contractSchema: "athyper.meta-entity-contract/2.1",
        entity: { entityCode: "reference_probe" },
        runtimeProfiles: [
          {
            profileKey: "default",
            backingKind: "virtual",
            apiExposure: "catalog_only",
            readMode: "none",
            writeMode: "none",
          },
        ],
        fields: [],
        operations: [],
        tests: [
          { key: "probe", assertion: "path_exists", path: "entity.entityCode" },
        ],
      };
      await repository.replaceGraph({
        changeSetId: draftId,
        expectedRevision: 0,
        actorId: c.created_by,
        graph,
      });
      const saved = await repository.loadGraph(draftId);
      const history = await repository.readDraftSave(draftId, 1);
      expect(history).toEqual(saved);
      const noOp = await repository.replaceGraph({
        changeSetId: draftId,
        expectedRevision: 1,
        actorId: c.created_by,
        graph: saved,
      });
      expect(noOp.revision).toBe(1);
      expect(await repository.listDraftSaves(draftId)).toHaveLength(2); // previous rev 0, saved rev 1
      const testBefore = (
        await sql<
          Record<string, unknown>
        >`SELECT * FROM metadata.entity_contract_test_case WHERE change_set_id=${draftId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      await repository.replaceGraph({
        changeSetId: draftId,
        expectedRevision: 1,
        actorId: c.created_by,
        graph: {
          ...saved,
          tests: [{ key: "probe", assertion: "path_exists", path: "entity" }],
        },
      });
      const testAfter = (
        await sql<
          Record<string, unknown>
        >`SELECT * FROM metadata.entity_contract_test_case WHERE change_set_id=${draftId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      expect(testAfter.id).toBe(testBefore.id);
      expect(testAfter.created_at).toEqual(testBefore.created_at);
      expect(await repository.readDraftSave(draftId, 1)).toEqual(history);
      await expect(
        repository.replaceGraph({
          changeSetId: draftId,
          expectedRevision: 1,
          actorId: c.created_by,
          graph: saved,
        }),
      ).rejects.toMatchObject({ code: "AUTHORING_REVISION_CONFLICT" });
      expect(await repository.listDraftSaves(draftId)).toHaveLength(3);
      await expect(
        sql`DELETE FROM snapshot.entity_draft_save WHERE change_set_id=${draftId}::uuid`.execute(
          db,
        ),
      ).rejects.toThrow("immutable");
      // Qualify the first normalized family against the real forward DDL and
      // shared repository. These are synthetic actors, not human review evidence.
      await sql
        .raw(
          `CREATE ROLE athyperapp; CREATE SCHEMA master;
        GRANT USAGE ON SCHEMA metadata,shared,master TO athyperapp;
        GRANT SELECT ON metadata.entity_change_set TO athyperapp;`,
        )
        .execute(db);
      for (const [path, name] of [
        [
          "ddl/common/shared/04_pre_constraints.sql",
          "shared.current_tenant_id",
        ],
        ["ddl/common/shared/07_functions.sql", "shared.current_tenant_id_soft"],
        [
          "ddl/planes/studio/master/07_functions.sql",
          "master.current_principal_id_soft",
        ],
      ]) {
        const source = read(path!),
          start = source.indexOf(`CREATE OR REPLACE FUNCTION ${name}(`);
        await sql
          .raw(source.slice(start, source.indexOf("$$;", start) + 3))
          .execute(db);
      }
      await sql
        .raw(read("migrations/20261006_entity_owned_label_commands.sql"))
        .execute(db);
      // Qualify the exact packaged upgrade before fixture login provisioning.
      const installation = read(
        "scripts/operations/upgrades/entity-product-command/20261008_entity_product_command_authority.sql",
      );
      await sql
        .raw(
          `ALTER TABLE metadata.entity_change_set ENABLE ROW LEVEL SECURITY;
        ALTER TABLE metadata.entity_change_set FORCE ROW LEVEL SECURITY;
        ALTER TABLE snapshot.entity_draft_save ENABLE ROW LEVEL SECURITY;
        ALTER TABLE snapshot.entity_draft_save FORCE ROW LEVEL SECURITY;`,
        )
        .execute(db);
      await db.connection().execute(async (connection) => {
        try {
          await expect(
            sql.raw(installation).execute(connection),
          ).rejects.toThrow("PRODUCT_COMMAND_READER_FORCED_RLS_REQUIRED");
        } finally {
          await sql`ROLLBACK`.execute(connection);
        }
      });
      const absent = async () => {
        expect(
          (
            await sql`SELECT rolname FROM pg_roles WHERE rolname IN ('athyper_product_command_owner','athyper_product_command_issuer','athyper_product_command_app')`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await sql`SELECT nspname FROM pg_namespace WHERE nspname='entity_command_private'`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
      };
      await absent();
      // Deliberately broad existing policies must not widen the installed scope.
      for (const table of ["entity", ...Object.keys(BRANCH_COLUMNS)]) {
        await sql
          .raw(
            `ALTER TABLE metadata.${table} ENABLE ROW LEVEL SECURITY;
          ALTER TABLE metadata.${table} FORCE ROW LEVEL SECURITY;
          CREATE POLICY fixture_public_read ON metadata.${table} FOR SELECT TO PUBLIC USING(true)`,
          )
          .execute(db);
      }
      await sql
        .raw(installation.replace(/COMMIT;\n$/, "ROLLBACK;\n"))
        .execute(db);
      await absent();
      await sql.raw(installation).execute(db);
      expect(
        (
          await sql`SELECT m.member FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid WHERE r.rolname IN ('athyper_product_command_owner','athyper_product_command_issuer','athyper_product_command_app')`.execute(
            db,
          )
        ).rows,
      ).toEqual([]);
      expect(
        (
          await sql`SELECT rolname FROM pg_roles WHERE rolname LIKE 'athyper_product_command_%' AND (rolcanlogin OR rolsuper OR rolbypassrls)`.execute(
            db,
          )
        ).rows,
      ).toEqual([]);
      // Only this disposable test provisions credential-free fixture logins.
      await sql
        .raw(
          `CREATE ROLE issuer_fixture LOGIN; GRANT athyper_product_command_issuer TO issuer_fixture;
        CREATE ROLE command_fixture LOGIN; GRANT athyper_product_command_app TO command_fixture;
        CREATE POLICY fixture_existing_product_read ON metadata.entity_change_set FOR SELECT TO athyperapp USING(tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());`,
        )
        .execute(db);
      for (const table of [
        "metadata.entity_change_set",
        "metadata.entity_label",
        "metadata.entity_label_translation",
        "metadata.entity_authoring_command_receipt",
        "snapshot.entity_draft_save",
      ]) {
        await sql
          .raw(
            `CREATE POLICY fixture_public_mutation ON ${table} FOR ALL TO PUBLIC USING(true) WITH CHECK(true)`,
          )
          .execute(db);
      }
      // A second raw installer invocation must fail before changing existing roles.
      await expect(
        sql
          .raw(
            readFileSync(
              new URL("./product-command-authority.sql", import.meta.url),
              "utf8",
            ),
          )
          .execute(db),
      ).rejects.toThrow("PRODUCT_COMMAND_INSTALLATION_CONFLICT");
      const appDb = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: "127.0.0.1",
            port,
            user: "command_fixture",
            database: "postgres",
            max: 2,
          }),
        }),
      });
      const issuerDb = new Kysely<Record<string, never>>({
        dialect: new PostgresDialect({
          pool: new Pool({
            host: "127.0.0.1",
            port,
            user: "issuer_fixture",
            database: "postgres",
            max: 1,
          }),
        }),
      });
      try {
        const scope = {
          authorityTenantId: randomUUID(),
          actorId: original,
          changeSetId: randomUUID(),
        };
        const productEntityId = randomUUID();
        await sql`INSERT INTO metadata.entity(id,module_id,entity_code,entity_class,ownership_model,created_by)
          VALUES(${productEntityId}::uuid,${randomUUID()}::uuid,'authority_probe','reference','system',${original}::uuid)`.execute(
          db,
        );
        await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by)
          VALUES(${scope.changeSetId}::uuid,${productEntityId}::uuid,'authority_fixture','Scoped authority fixture',${original}::uuid)`.execute(
          db,
        );
        const adminReader = new KyselyMetaEntityAuthoringRepository(db);
        const source = await adminReader.loadGraph(scope.changeSetId);
        const revision = (await adminReader.get(scope.changeSetId))!.revision;
        const request = {
          changeSetId: scope.changeSetId,
          actorId: original,
          tenantId: null,
          proposal: {
            sourceHash: sha256(source),
            revision,
            idempotencyKey: "product-authority-fixture-0001",
            defaultLocale: "en",
            requiredLocales: ["en"],
            declarations: [
              {
                sourcePath: "/entity/entityCode",
                labelKey: "reference.authority",
                defaultText: source.entity.entityCode,
              },
            ],
          },
        };
        let authorized = true;
        const authority = createProductCommandAuthority({
          issuer: issuerDb,
          applicationLogin: "command_fixture",
          governance: {
            async authorize() {
              if (!authorized) throw Error("GOVERNANCE_REVOKED");
            },
          },
        });
        const host: NativeAuthoringPolicy = {
          ...fixtureProductHost,
          async admit(connection, input) {
            if (
              input.actorId !== scope.actorId ||
              input.changeSetId !== scope.changeSetId ||
              input.tenantId !== null
            )
              throw Error("SCOPE_DENIED");
            const admitted = (
              await sql<{
                ok: boolean;
              }>`SELECT entity_command_private.admitted(${input.changeSetId}::uuid) ok`.execute(
                connection,
              )
            ).rows[0]?.ok;
            if (!admitted) throw Error("DATABASE_ADMISSION_REQUIRED");
          },
        };
        let auditFails = true;
        const enrollmentOptions = (selectedAuthority = authority) => ({
          database: appDb,
          authority: selectedAuthority,
          labels: {
            supportedLocales: ["en"],
            maxCommands: 20,
            maxBatchBytes: 16000,
          },
          host,
          async audit(
            tx: Parameters<
              Parameters<typeof createProductLabelEnrollment>[0]["audit"]
            >[0],
            _context: VerifiedRequestContext,
            input: Parameters<
              Parameters<typeof createProductLabelEnrollment>[0]["audit"]
            >[2],
          ) {
            expect(input.actorId).toBe(scope.actorId);
            expect(
              (
                await sql<{
                  role: string;
                }>`SELECT current_user AS role`.execute(tx)
              ).rows[0]?.role,
            ).toBe("command_fixture");
            expect(
              (
                await sql`SELECT id FROM metadata.entity_change_set WHERE id<>${scope.changeSetId}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            expect(
              (
                await sql`SELECT id FROM metadata.entity WHERE id<>${productEntityId}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            expect(
              (
                await sql`SELECT id FROM metadata.entity_field WHERE change_set_id<>${scope.changeSetId}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            if (auditFails) throw Error("AUDIT_UNAVAILABLE");
          },
        });
        const enrollment = (selectedAuthority = authority) =>
          createProductLabelEnrollment(enrollmentOptions(selectedAuthority));
        const enroll = enrollment();
        // Authentication/governance is deliberately fixture-owned in this rehearsal.
        const context = {
          tenantId: scope.authorityTenantId,
          principalId: scope.actorId,
        } as VerifiedRequestContext;
        for (const table of ["entity", ...Object.keys(BRANCH_COLUMNS)]) {
          const rows =
            await sql`SELECT * FROM ${sql.table(`metadata.${table}`)}`.execute(
              appDb,
            );
          expect(rows.rows, `unadmitted ${table}`).toEqual([]);
          const privileges = await sql<{
            write: boolean;
          }>`SELECT has_table_privilege(current_user,${`metadata.${table}`},'INSERT,UPDATE,DELETE') AS write`.execute(
            appDb,
          );
          expect(privileges.rows[0]?.write, `read-only ${table}`).toBe(false);
        }
        const run = () =>
          enroll(context, {
            changeSetId: request.changeSetId,
            proposal: request.proposal,
          });
        await expect(run()).rejects.toThrow("AUDIT_UNAVAILABLE");
        expect((await adminReader.get(scope.changeSetId))?.revision).toBe(
          revision,
        );
        expect(
          await adminReader.readDraftSave(scope.changeSetId, revision + 1),
        ).toBeNull();
        auditFails = false;
        await expect(
          sql`UPDATE metadata.entity_change_set SET default_locale='en' WHERE id=${scope.changeSetId}::uuid RETURNING id`.execute(
            appDb,
          ),
        ).resolves.toMatchObject({ rows: [] });
        await expect(
          sql`INSERT INTO entity_command_private.admission(token_hash) VALUES(decode(repeat('00',32),'hex'))`.execute(
            appDb,
          ),
        ).rejects.toThrow(/permission denied/);
        await appDb.transaction().execute(async (tx) => {
          await sql`SELECT set_config('app.current_principal_id',${original},true),set_config('app.current_tenant_id',${scope.authorityTenantId},true),set_config('app.entity_change_set_write_token',${scope.changeSetId + ":1"},true)`.execute(
            tx,
          );
          expect(
            (
              await sql`UPDATE metadata.entity_change_set SET default_locale='en' WHERE id=${scope.changeSetId}::uuid RETURNING id`.execute(
                tx,
              )
            ).rows,
          ).toEqual([]);
        });
        await expect(
          enrollment({
            ...authority,
            async revoke() {
              throw Error("issuer unavailable after commit");
            },
          })(context, {
            changeSetId: request.changeSetId,
            proposal: request.proposal,
          }),
        ).rejects.toMatchObject({
          code: "PRODUCT_COMMAND_REVOCATION_FAILED",
          outcome: "committed",
          committedResult: { revision: revision + 1 },
        });
        expect((await adminReader.get(scope.changeSetId))?.revision).toBe(
          revision + 1,
        );
        // Fresh governance with the SAME canonical identity recovers the result.
        const app = express();
        registerProductLabelEnrollmentRoutes(app, {
          ...enrollmentOptions(),
          authenticate(req, res, next) {
            if (req.headers.authorization !== "Bearer fixture-human") {
              res.sendStatus(401);
              return;
            }
            next();
          },
          readContext: () => context,
        });
        const server = app.listen(0);
        await new Promise<void>((resolve) => server.once("listening", resolve));
        const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/platform-control/meta-entity-authoring/change-sets/${scope.changeSetId}/enroll-labels`;
        let first: Awaited<ReturnType<typeof enroll>>;
        try {
          expect((await fetch(url, { method: "POST" })).status).toBe(401);
          const response = await fetch(url, {
            method: "POST",
            headers: {
              authorization: "Bearer fixture-human",
              "content-type": "application/json",
            },
            body: JSON.stringify({ proposal: request.proposal }),
          });
          expect(response.status).toBe(200);
          first = (await response.json()) as Awaited<ReturnType<typeof enroll>>;
        } finally {
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
        expect(first.revision).toBe(revision + 1);
        expect(await run()).toEqual(first);
        expect(
          (await adminReader.loadGraph(scope.changeSetId)).ownedLabels?.labels,
        ).toHaveLength(1);
        authorized = false;
        await expect(run()).rejects.toThrow("GOVERNANCE_REVOKED");
        authorized = true;
        await withProductCommandAuthority({
          authority,
          context: null,
          scope,
          command: request,
          database: appDb,
          execute: async (tx) => {
            expect(
              (
                await sql`UPDATE metadata.entity_change_set SET default_locale='en' WHERE id=${draftId}::uuid RETURNING id`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
          },
        });
        // RLS constrains scope, not exact command SQL. Demonstrate an in-scope
        // direct mutation under admission; canonical-writer trust is mandatory.
        const reusable = await authority.issue(null, scope, request);
        await expect(
          appDb.transaction().execute(async (tx) => {
            await enterProductCommand(tx, reusable, request);
            await sql`SELECT metadata.fn_advance_entity_change_set(${scope.changeSetId}::uuid,${first.revision},${original}::uuid)`.execute(
              tx,
            );
            const changed =
              await sql`UPDATE metadata.entity_label SET default_text='Noncanonical effect',updated_by=${original}::uuid,updated_at=clock_timestamp() WHERE change_set_id=${scope.changeSetId}::uuid RETURNING id`.execute(
                tx,
              );
            expect(changed.rows).toHaveLength(1);
            throw Error("SIMULATED_PROCESS_FAILURE");
          }),
        ).rejects.toThrow("SIMULATED_PROCESS_FAILURE");
        // Rollback undoes consumption; absent separate revocation it is reusable.
        await appDb
          .transaction()
          .execute((tx) => enterProductCommand(tx, reusable, request));
        await expect(
          appDb
            .transaction()
            .execute((tx) => enterProductCommand(tx, reusable, request)),
        ).rejects.toThrow("ADMISSION_DENIED");
        await authority.revoke(reusable.token);
        const expired = await authority.issue(null, scope, request);
        await sql`UPDATE entity_command_private.admission SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=sha256(convert_to(${expired.token},'UTF8'))`.execute(
          db,
        );
        await expect(
          appDb
            .transaction()
            .execute((tx) => enterProductCommand(tx, expired, request)),
        ).rejects.toThrow("ADMISSION_DENIED");
        const admission = await authority.issue(null, scope, request);
        await expect(
          appDb.transaction().execute(async (tx) => {
            await enterProductCommand(
              tx,
              { ...admission, scope: { ...scope, actorId: randomUUID() } },
              request,
            );
          }),
        ).rejects.toThrow("CONTENT_MISMATCH");
        await expect(
          appDb.transaction().execute(async (tx) => {
            await sql`SELECT set_config('app.current_tenant_id',${scope.authorityTenantId},true),set_config('app.current_principal_id',${randomUUID()},true)`.execute(
              tx,
            );
            await sql`SELECT entity_command_private.enter(${admission.token},${admission.requestHash})`.execute(
              tx,
            );
          }),
        ).rejects.toThrow("ADMISSION_DENIED");
        await authority.revoke(admission.token);
        await expect(
          appDb
            .transaction()
            .execute((tx) => enterProductCommand(tx, admission, request)),
        ).rejects.toThrow("ADMISSION_DENIED");
        await expect(
          withProductCommandAuthority({
            authority,
            context: null,
            scope,
            command: request,
            database: appDb,
            execute: async (tx) => {
              const current = await new KyselyMetaEntityAuthoringRepository(
                tx,
              ).loadGraph(scope.changeSetId);
              await new KyselyMetaEntityAuthoringRepository(
                tx,
                undefined,
                {
                  supportedLocales: ["en"],
                  maxCommands: 20,
                  maxBatchBytes: 16000,
                },
                undefined,
                fixtureProductHost,
              ).executeLabelCommands({
                changeSetId: scope.changeSetId,
                actorId: original,
                tenantId: null,
                batch: {
                  contract: "entity.authoring-label-commands/1",
                  expectedRevision: first.revision,
                  idempotencyKey: "product-authority-rollback-0001",
                  commands: [
                    {
                      kind: "updateMember",
                      memberKind: "label",
                      member: { id: current.ownedLabels!.labels[0]!.id },
                      set: { defaultText: "Rolled back" },
                    },
                  ],
                },
              });
              throw Error("PRODUCT_COMMAND_ROLLBACK");
            },
          }),
        ).rejects.toThrow("PRODUCT_COMMAND_ROLLBACK");
        expect((await adminReader.get(scope.changeSetId))?.revision).toBe(
          first.revision,
        );
        expect(
          (await adminReader.loadGraph(scope.changeSetId)).ownedLabels
            ?.labels[0]?.defaultText,
        ).toBe(source.entity.entityCode);
        expect(
          (
            await sql`SELECT 1 FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${scope.changeSetId}::uuid AND idempotency_key='product-authority-rollback-0001'`.execute(
              db,
            )
          ).rows,
        ).toEqual([]);
        expect(
          await adminReader.readDraftSave(
            scope.changeSetId,
            first.revision + 1,
          ),
        ).toBeNull();
      } finally {
        await appDb.destroy();
        await issuerDb.destroy();
        // The hostile PUBLIC policies belong only to this qualification scenario.
        for (const table of [
          "metadata.entity_change_set",
          "metadata.entity_label",
          "metadata.entity_label_translation",
          "metadata.entity_authoring_command_receipt",
          "snapshot.entity_draft_save",
        ]) {
          await sql
            .raw(`DROP POLICY fixture_public_mutation ON ${table}`)
            .execute(db);
        }
      }
      const normalized = new KyselyMetaEntityAuthoringRepository(
        db,
        undefined,
        {
          supportedLocales: ["en", "ms"],
          maxCommands: 20,
          maxBatchBytes: 16000,
        },
        undefined,
        fixtureProductHost,
      );
      // Full enrollment application/replay using the real repository and history;
      // outer rollback retains the independent command fixtures below.
      await expect(
        db.transaction().execute(async (tx) => {
          const bootstrap = new KyselyMetaEntityAuthoringRepository(
            tx,
            undefined,
            { supportedLocales: ["en"], maxCommands: 20, maxBatchBytes: 16000 },
            undefined,
            fixtureProductHost,
          );
          const source = await bootstrap.loadGraph(draftId);
          const request = {
            changeSetId: draftId,
            actorId: original,
            tenantId: null,
            proposal: {
              sourceHash: sha256(source),
              revision: 2,
              idempotencyKey: "bootstrap-labels-fixture-0001",
              defaultLocale: "en",
              requiredLocales: ["en"],
              declarations: [
                {
                  sourcePath: "/entity/entityCode",
                  labelKey: "reference.bootstrap",
                  defaultText: source.entity.entityCode,
                },
              ],
            },
          };
          const enrolled =
            await bootstrap.executeLegacyLabelEnrollment(request);
          expect(enrolled.revision).toBe(3);
          expect(await bootstrap.executeLegacyLabelEnrollment(request)).toEqual(
            enrolled,
          );
          expect(
            (await bootstrap.loadGraph(draftId)).ownedLabels?.labels.some(
              (l) => l.labelKey === "reference.bootstrap",
            ),
          ).toBe(true);
          await expect(
            bootstrap.executeLegacyLabelEnrollment({
              ...request,
              proposal: { ...request.proposal, sourceHash: "0".repeat(64) },
            }),
          ).rejects.toThrow("LEGACY_LABEL_SOURCE_MISMATCH");
          expect((await bootstrap.get(draftId))?.revision).toBe(3);
          throw Error("BOOTSTRAP_FIXTURE_ROLLBACK");
        }),
      ).rejects.toThrow("BOOTSTRAP_FIXTURE_ROLLBACK");
      const command = (
        expectedRevision: number,
        idempotencyKey: string,
        commands: unknown[],
      ) => ({
        changeSetId: draftId,
        actorId: original,
        tenantId: null,
        batch: {
          contract: "entity.authoring-label-commands/1",
          expectedRevision,
          idempotencyKey,
          commands,
        },
      });
      const initial = command(2, "normalized-command-0001", [
        {
          kind: "updateMember",
          memberKind: "labelSettings",
          set: { defaultLocale: "en", requiredLocales: ["en", "ms"] },
        },
        {
          kind: "addMember",
          memberKind: "labelTranslation",
          tempRef: "translation",
          value: {
            label: { $tempRef: "name" },
            localeCode: "ms",
            text: "Nama",
          },
        },
        {
          kind: "addMember",
          memberKind: "label",
          tempRef: "name",
          value: { labelKey: "reference.name", defaultText: "Name" },
        },
      ]);
      const replay = await Promise.all([
        normalized.executeLabelCommands(initial),
        normalized.executeLabelCommands(initial),
      ]);
      expect(replay[0]).toEqual(replay[1]);
      expect(replay[0]).toMatchObject({ revision: 3, changed: true });
      const normalizedSnapshot = await normalized.readDraftSave(draftId, 3);
      expect(normalizedSnapshot?.contractSchema).toBe(
        "athyper.meta-entity-contract/2.2",
      );
      expect(normalizedSnapshot?.ownedLabels?.translations[0]?.labelId).toBe(
        replay[0]!.identities.name,
      );
      expect(await normalized.listDraftSaves(draftId)).toHaveLength(4);
      await expect(
        normalized.executeLabelCommands({ ...initial, actorId: randomUUID() }),
      ).rejects.toMatchObject({ code: "AUTHORING_IDEMPOTENCY_CONFLICT" });
      const labelId = replay[0]!.identities.name!;
      const labelBefore = (
        await sql<
          Record<string, unknown>
        >`SELECT * FROM metadata.entity_label WHERE id=${labelId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      const update = {
        kind: "updateMember",
        memberKind: "label",
        member: { id: labelId },
        set: { defaultText: "Title" },
      };
      expect(
        await normalized.executeLabelCommands(
          command(3, "normalized-command-0002", [update]),
        ),
      ).toMatchObject({ revision: 4, changed: true });
      const labelAfter = (
        await sql<
          Record<string, unknown>
        >`SELECT * FROM metadata.entity_label WHERE id=${labelId}::uuid`.execute(
          db,
        )
      ).rows[0]!;
      expect(labelAfter.created_at).toEqual(labelBefore.created_at);
      expect(labelAfter.created_by).toBe(labelBefore.created_by);
      expect(
        await normalized.executeLabelCommands(
          command(4, "normalized-command-0003", [update]),
        ),
      ).toMatchObject({ revision: 4, changed: false });
      expect(await normalized.listDraftSaves(draftId)).toHaveLength(5);
      expect(await normalized.executeLabelCommands(initial)).toEqual(replay[0]); // Exact historical response, even after a newer save.
      await expect(
        normalized.executeLabelCommands(
          command(3, "normalized-command-0004", [update]),
        ),
      ).rejects.toMatchObject({ code: "AUTHORING_REVISION_CONFLICT" });
      await expect(
        normalized.executeLabelCommands(
          command(4, "normalized-command-0005", [
            {
              kind: "removeMember",
              memberKind: "label",
              member: { id: labelId },
            },
          ]),
        ),
      ).rejects.toThrow("FOUNDATION_REFERENCE_INVALID");
      // A failure after revision advance must roll back to the command savepoint,
      // even when the caller catches it and commits the outer transaction.
      await sql
        .raw(
          `CREATE FUNCTION metadata.reject_label_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture write failure'; END $$;
      CREATE TRIGGER reject_label_update BEFORE UPDATE ON metadata.entity_label FOR EACH ROW EXECUTE FUNCTION metadata.reject_label_update();`,
        )
        .execute(db);
      await db.transaction().execute(async (tx) => {
        const nested = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          {
            supportedLocales: ["en", "ms"],
            maxCommands: 20,
            maxBatchBytes: 16000,
          },
          undefined,
          fixtureProductHost,
        );
        await expect(
          nested.executeLabelCommands(
            command(4, "normalized-command-0006", [
              { ...update, set: { defaultText: "Rollback" } },
            ]),
          ),
        ).rejects.toThrow("fixture write failure");
        expect((await nested.get(draftId))?.revision).toBe(4);
      });
      await sql
        .raw(
          "DROP TRIGGER reject_label_update ON metadata.entity_label; DROP FUNCTION metadata.reject_label_update();",
        )
        .execute(db);
      expect(await normalized.readDraftSave(draftId, 3)).toEqual(
        normalizedSnapshot,
      );
      await expect(
        sql`UPDATE metadata.entity_authoring_command_receipt SET request_hash=repeat('0',64) WHERE change_set_id=${draftId}::uuid`.execute(
          db,
        ),
      ).rejects.toThrow("immutable");
      expect(
        (
          await sql`SELECT * FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${draftId}::uuid`.execute(
            db,
          )
        ).rows,
      ).toHaveLength(3);
      const tenant = randomUUID();
      await db.transaction().execute(async (tx) => {
        await sql`SET LOCAL ROLE athyperapp`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${original},true)`.execute(
          tx,
        );
        expect(
          (await sql`SELECT * FROM metadata.entity_label`.execute(tx)).rows,
        ).toEqual([]);
        expect(
          (
            await sql`SELECT * FROM metadata.entity_authoring_command_receipt`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await sql`UPDATE metadata.entity_label SET default_text='forbidden',updated_at=clock_timestamp(),updated_by=${original}::uuid WHERE id=${labelId}::uuid RETURNING id`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
      });
      await expect(
        db.transaction().execute(async (tx) => {
          await sql`SET LOCAL ROLE athyperapp`.execute(tx);
          await sql`SELECT set_config('app.current_tenant_id',${tenant},true),set_config('app.current_principal_id',${original},true),set_config('app.entity_change_set_write_token',${draftId + ":4"},true)`.execute(
            tx,
          );
          await sql`INSERT INTO metadata.entity_label(tenant_id,entity_id,change_set_id,label_key,default_text,source_kind,created_by)
          VALUES(NULL,${entityId}::uuid,${draftId}::uuid,'forbidden','Forbidden','owned',${original}::uuid)`.execute(
            tx,
          );
        }),
      ).rejects.toMatchObject({ code: "42501" });

      // Existing native save preserves the normalized family and rejects attempts
      // to overwrite it through the old whole-graph transport.
      const withLabels = await normalized.loadGraph(draftId);
      expect(
        (
          await normalized.replaceGraph({
            changeSetId: draftId,
            expectedRevision: 4,
            actorId: original,
            graph: withLabels,
          })
        ).revision,
      ).toBe(4);
      await expect(
        normalized.replaceGraph({
          changeSetId: draftId,
          expectedRevision: 4,
          actorId: original,
          graph: {
            ...withLabels,
            ownedLabels: { ...withLabels.ownedLabels!, labels: [] },
          },
        }),
      ).rejects.toMatchObject({ code: "NORMALIZED_COMMAND_REQUIRED" });
      // The remaining normalized members use the same repository and snapshot path.
      await sql
        .raw(read("migrations/20261006_entity_reference_members.sql"))
        .execute(db);
      await sql
        .raw(
          read("migrations/20261006_entity_reference_predicate_validation.sql"),
        )
        .execute(db);
      await sql
        .raw(read("migrations/20261006_entity_reference_predicate_roots.sql"))
        .execute(db);
      await sql
        .raw(read("migrations/20261006_entity_reference_anchor_guards.sql"))
        .execute(db);
      const referencePolicy = {
        maxCommands: 100,
        maxBatchBytes: 64000,
        maxMembers: 200,
        maxPredicateDepth: 16,
      };
      const referenceRepository = new KyselyMetaEntityAuthoringRepository(
        db,
        undefined,
        undefined,
        referencePolicy,
        fixtureProductHost,
      );
      const referenceCommand = (
        revision: number,
        key: string,
        commands: unknown[],
      ) => ({
        changeSetId: draftId,
        tenantId: null,
        actorId: original,
        batch: {
          contract: "entity.authoring-reference-commands/1",
          expectedRevision: revision,
          idempotencyKey: key,
          commands,
        },
      });
      const targetCommand = referenceCommand(
        4,
        "reference-target-create-0001",
        [
          {
            kind: "addMember",
            memberKind: "target",
            tempRef: "target",
            value: {
              targetPlane: "studio",
              requirement: "required",
              position: 1,
            },
          },
        ],
      );
      const targetResult =
        await referenceRepository.executeReferenceCommands(targetCommand);
      expect(targetResult.revision).toBe(5);
      expect(
        await referenceRepository.executeReferenceCommands(targetCommand),
      ).toEqual(targetResult);
      const referenceGraph = await referenceRepository.loadGraph(draftId);
      expect(referenceGraph.contractSchema).toBe(
        "athyper.meta-entity-contract/2.3",
      );
      expect(referenceGraph.referenceMembers?.members.target[0]?.id).toBe(
        targetResult.identities.target,
      );
      expect(
        (await referenceRepository.readDraftSave(draftId, 5))?.referenceMembers
          ?.members.target,
      ).toHaveLength(1);
      expect(
        (
          await referenceRepository.executeReferenceCommands(
            referenceCommand(5, "reference-target-noop-0001", [
              {
                kind: "updateMember",
                memberKind: "target",
                id: targetResult.identities.target,
                set: { requirement: "required" },
                clear: [],
              },
            ]),
          )
        ).changed,
      ).toBe(false);
      await expect(
        referenceRepository.executeReferenceCommands(
          referenceCommand(4, "reference-target-stale-0001", [
            {
              kind: "removeMember",
              memberKind: "target",
              id: targetResult.identities.target,
            },
          ]),
        ),
      ).rejects.toBeInstanceOf(Error);
      await expect(
        referenceRepository.executeReferenceCommands(
          referenceCommand(5, "reference-target-invalid-0001", [
            {
              kind: "addMember",
              memberKind: "target",
              tempRef: "collision",
              value: {
                targetPlane: "studio",
                requirement: "required",
                position: 2,
              },
            },
          ]),
        ),
      ).rejects.toMatchObject({ code: "REFERENCE_MEMBER_COORDINATE_CONFLICT" });
      // Seed anchors only inside this disposable fixture: these are not runtime
      // initialization or human authority receipts.
      await db.transaction().execute(async (tx) => {
        await sql`SELECT metadata.fn_advance_entity_change_set(${draftId}::uuid,5,${original}::uuid)`.execute(
          tx,
        );
        await sql`INSERT INTO metadata.entity_field(id,entity_id,change_set_id,field_key,data_type,type_config,created_by) VALUES(${fixtureId(2)}::uuid,${entityId}::uuid,${draftId}::uuid,'choice','enum','{"kind":"enum"}'::jsonb,${original}::uuid),(${fixtureId(3)}::uuid,${entityId}::uuid,${draftId}::uuid,'technical','uuid','{"kind":"uuid"}'::jsonb,${original}::uuid)`.execute(
          tx,
        );
        await sql`INSERT INTO metadata.entity_surface(id,entity_id,change_set_id,surface_key,surface_kind,title,created_by) VALUES(${fixtureId(4)}::uuid,${entityId}::uuid,${draftId}::uuid,'list','list','List',${original}::uuid),(${fixtureId(5)}::uuid,${entityId}::uuid,${draftId}::uuid,'detail','detail','Detail',${original}::uuid)`.execute(
          tx,
        );
        await sql`INSERT INTO metadata.entity_operation(id,entity_id,change_set_id,operation_key,operation_kind,label,handler_key,audit_event_code,created_by) VALUES(${fixtureId(6)}::uuid,${entityId}::uuid,${draftId}::uuid,'read','read','Read','entity.record.read.v1','test.read',${original}::uuid),(${fixtureId(7)}::uuid,${entityId}::uuid,${draftId}::uuid,'update','update','Update','entity.record.patch.v1','test.update',${original}::uuid)`.execute(
          tx,
        );
        await sql`INSERT INTO metadata.entity_surface_field_binding(id,entity_id,change_set_id,entity_surface_id,entity_field_id,binding_key,position,created_by) VALUES(${fixtureId(8)}::uuid,${entityId}::uuid,${draftId}::uuid,${fixtureId(4)}::uuid,${fixtureId(2)}::uuid,'choice',0,${original}::uuid),(${fixtureId(9)}::uuid,${entityId}::uuid,${draftId}::uuid,${fixtureId(4)}::uuid,${fixtureId(3)}::uuid,'technical',1,${original}::uuid)`.execute(
          tx,
        );
      });
      const fixture = referenceFixture();
      const sourceToKind = new Map(
        Object.entries(fixture.members).map(([k, r]) => [
          r[0]!.id,
          k.toLowerCase(),
        ]),
      );
      const allCommands = Object.entries(fixture.members)
        .filter(([k]) => k !== "target")
        .map(([memberKind, rows]) => {
          const { id, ...raw } = rows[0]!;
          return {
            kind: "addMember",
            memberKind,
            tempRef: memberKind.toLowerCase(),
            value: Object.fromEntries(
              Object.entries(raw).map(([p, v]) => [
                p,
                v === fixtureId(10)
                  ? labelId
                  : v === fixtureId(1)
                    ? draftId
                    : sourceToKind.has(String(v))
                      ? { $tempRef: sourceToKind.get(String(v)) }
                      : v,
              ]),
            ),
          };
        });
      const allResult = await referenceRepository.executeReferenceCommands(
        referenceCommand(6, "reference-all-members-0001", allCommands),
      );
      const complete = await referenceRepository.loadGraph(draftId);
      for (const rows of Object.values(complete.referenceMembers!.members))
        expect(rows).toHaveLength(1);
      const choiceId = allResult.identities.fieldchoice!;
      const originalCreation = (
        await sql`SELECT created_at,created_by FROM metadata.entity_field_choice WHERE id=${choiceId}::uuid`.execute(
          db,
        )
      ).rows;
      await referenceRepository.executeReferenceCommands(
        referenceCommand(7, "reference-choice-update-0001", [
          {
            kind: "updateMember",
            memberKind: "fieldChoice",
            id: choiceId,
            set: { valueText: "other" },
            clear: [],
          },
        ]),
      );
      expect(
        (
          await sql`SELECT created_at,created_by FROM metadata.entity_field_choice WHERE id=${choiceId}::uuid`.execute(
            db,
          )
        ).rows,
      ).toEqual(originalCreation);
      await expect(
        referenceRepository.executeReferenceCommands(
          referenceCommand(8, "reference-remove-view-0001", [
            {
              kind: "removeMember",
              memberKind: "surfaceView",
              id: allResult.identities.surfaceview,
            },
          ]),
        ),
      ).rejects.toMatchObject({ code: "REFERENCE_FOREIGN_MEMBER" });
      await expect(
        db.transaction().execute(async (tx) => {
          await sql`SELECT metadata.fn_advance_entity_change_set(${draftId}::uuid,8,${original}::uuid)`.execute(
            tx,
          );
          await sql`UPDATE metadata.entity_predicate SET value_numeric=1,updated_at=clock_timestamp(),updated_by=${original}::uuid WHERE id=${allResult.identities.predicate}::uuid`.execute(
            tx,
          );
        }),
      ).rejects.toThrow("Predicate payload/operator mismatch");
      expect((await referenceRepository.get(draftId))?.revision).toBe(8);
      expect(
        await referenceRepository.executeReferenceCommands(targetCommand),
      ).toEqual(targetResult);
      // Removals are explicit, dependency-aware and atomic; no cascade is used.
      await referenceRepository.executeReferenceCommands(
        referenceCommand(
          8,
          "reference-remove-all-0001",
          Object.entries(complete.referenceMembers!.members).flatMap(
            ([memberKind, rows]) =>
              rows.map((r) => ({ kind: "removeMember", memberKind, id: r.id })),
          ),
        ),
      );
      expect(
        (await referenceRepository.loadGraph(draftId)).referenceMembers?.members
          .target,
      ).toEqual([]);
      const reserved = await referenceRepository.executeReferenceCommands(
        referenceCommand(9, "reference-reserve-identity-0001", [
          {
            kind: "reserveFieldIdentity",
            fieldId: fixtureId(2),
            tempRef: "identity",
          },
        ]),
      );
      const stable = (await referenceRepository.readDraftSave(draftId, 10))
        ?.fieldIdentities;
      expect(stable).toHaveLength(1);
      expect(stable?.[0]?.id).toBe(reserved.identities.identity);
      await expect(
        db.transaction().execute(async (tx) => {
          await sql`UPDATE metadata.entity_field_identity SET identity_status='active',first_release_id=shared.uuidv7() WHERE id=${reserved.identities.identity}::uuid`.execute(
            tx,
          );
        }),
      ).rejects.toThrow("REFERENCE_IDENTITY_LIFECYCLE_NOT_QUALIFIED");
      await db.transaction().execute(async (tx) => {
        await sql`SELECT metadata.fn_advance_entity_change_set(${draftId}::uuid,10,${original}::uuid)`.execute(
          tx,
        );
        await sql`INSERT INTO metadata.entity_field(id,entity_id,change_set_id,field_key,data_type,type_config,created_by) VALUES(${fixtureId(11)}::uuid,${entityId}::uuid,${draftId}::uuid,'amount','decimal','{"kind":"decimal"}'::jsonb,${original}::uuid),(${fixtureId(12)}::uuid,${entityId}::uuid,${draftId}::uuid,'date','date','{"kind":"date"}'::jsonb,${original}::uuid),(${fixtureId(13)}::uuid,${entityId}::uuid,${draftId}::uuid,'time','datetime','{"kind":"datetime"}'::jsonb,${original}::uuid)`.execute(
          tx,
        );
      });
      const decimal = ["9007199254740993.123456789012345678901"];
      const dates = ["2026-10-06"];
      const times = ["2026-10-06T08:00:00.123456Z"];
      const typed = await referenceRepository.executeReferenceCommands(
        referenceCommand(11, "reference-precision-0001", [
          {
            kind: "addMember",
            memberKind: "surfaceView",
            tempRef: "view",
            value: referencePayload("surfaceView", {
              entitySurfaceId: fixtureId(4),
              viewKey: "precision",
              viewKind: "default",
              density: "comfortable",
              mode: "table",
            }),
          },
          {
            kind: "addMember",
            memberKind: "predicate",
            tempRef: "root",
            value: referencePayload("predicate", {
              predicateKey: "root",
              nodeKind: "group",
              conjunction: "all",
              purpose: "list_filter",
              viewId: { $tempRef: "view" },
            }),
          },
          ...[
            {
              field: 11,
              key: "decimal",
              kind: "numeric_set",
              property: "valueNumericSet",
              value: decimal,
            },
            {
              field: 12,
              key: "date",
              kind: "date_set",
              property: "valueDateSet",
              value: dates,
            },
            {
              field: 13,
              key: "time",
              kind: "datetime_set",
              property: "valueDatetimeSet",
              value: times,
            },
          ].map((v, i) => ({
            kind: "addMember",
            memberKind: "predicate",
            tempRef: v.key,
            value: referencePayload("predicate", {
              predicateKey: v.key,
              parentPredicateId: { $tempRef: "root" },
              nodeKind: "condition",
              purpose: "list_filter",
              entityFieldId: fixtureId(v.field),
              operator: "in",
              valueKind: v.kind,
              [v.property]: v.value,
              position: i + 1,
            }),
          })),
        ]),
      );

      await expect(
        db.transaction().execute(async (tx) => {
          await sql`SELECT metadata.fn_advance_entity_change_set(${draftId}::uuid,12,${original}::uuid)`.execute(
            tx,
          );
          await sql`UPDATE metadata.entity_surface SET surface_kind='form',updated_at=clock_timestamp(),updated_by=${original}::uuid WHERE id=${fixtureId(4)}::uuid`.execute(
            tx,
          );
        }),
      ).rejects.toThrow("View surface is incompatible");
      expect((await referenceRepository.get(draftId))?.revision).toBe(12);
      const precise = await referenceRepository.loadGraph(draftId);
      expect(
        precise.referenceMembers!.members.predicate.find(
          (p) => p.id === typed.identities.decimal,
        )?.valueNumericSet,
      ).toEqual(decimal);
      expect(
        precise.referenceMembers!.members.predicate.find(
          (p) => p.id === typed.identities.date,
        )?.valueDateSet,
      ).toEqual(dates);
      expect(
        precise.referenceMembers!.members.predicate.find(
          (p) => p.id === typed.identities.time,
        )?.valueDatetimeSet,
      ).toEqual(times);
      expect(
        (
          await referenceRepository.executeReferenceCommands(
            referenceCommand(12, "reference-precision-noop-0001", [
              {
                kind: "updateMember",
                memberKind: "predicate",
                id: typed.identities.decimal,
                set: { valueNumericSet: decimal },
                clear: [],
              },
            ]),
          )
        ).changed,
      ).toBe(false);
      await expect(
        referenceRepository.executeReferenceCommands(
          referenceCommand(12, "reference-second-root-0001", [
            {
              kind: "addMember",
              memberKind: "predicate",
              tempRef: "secondroot",
              value: referencePayload("predicate", {
                predicateKey: "secondroot",
                nodeKind: "group",
                conjunction: "all",
                purpose: "list_filter",
                viewId: typed.identities.view,
                position: 2,
              }),
            },
          ]),
        ),
      ).rejects.toMatchObject({ code: "REFERENCE_PREDICATE_ROOT_CONFLICT" });
      await db.transaction().execute(async (tx) => {
        await sql`SET LOCAL ROLE athyperapp`.execute(tx);
        await sql`SELECT set_config('app.current_tenant_id',${tenant},true)`.execute(
          tx,
        );
        expect(
          (await sql`SELECT * FROM metadata.entity_target`.execute(tx)).rows,
        ).toEqual([]);
      });
      // Rehearse dormant native column installation after populated legacy saves.
      // Existing canonical graph/snapshot history and constraints remain intact.
      const revisionDdl = read("ddl/planes/studio/snapshot/03_tables.sql");
      const revisionStart = revisionDdl.indexOf(
        "CREATE TABLE snapshot.entity_contract_revision (",
      );
      await sql
        .raw(
          revisionDdl.slice(
            revisionStart,
            revisionDdl.indexOf("\n);", revisionStart) + 3,
          ),
        )
        .execute(db);
      await sql`INSERT INTO snapshot.entity_contract_revision(entity_id,change_set_id,revision_no,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,captured_by)
        VALUES(${entityId}::uuid,${draftId}::uuid,1,'athyper.meta-entity-contract','2.1','{"retained":"historical_fixture"}'::jsonb,${"a".repeat(64)},${"b".repeat(64)},32,${original}::uuid)`.execute(
        db,
      );
      const legacyBefore = await referenceRepository.loadGraph(draftId);
      const snapshotBefore = (
        await sql`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY change_set_id,lock_version)::text,'')) AS hash FROM snapshot.entity_draft_save t`.execute(
          db,
        )
      ).rows;
      const constraintsBefore = (
        await sql<{
          name: string;
          definition: string;
        }>`SELECT con.conname AS name,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='metadata' AND t.relname IN ('entity_field','entity_runtime_profile','entity_surface','entity_surface_section','entity_surface_field_binding') ORDER BY con.conname`.execute(
          db,
        )
      ).rows;
      await sql
        .raw(read("migrations/20261006_entity_core_layout_columns.sql"))
        .execute(db);
      expect(await referenceRepository.loadGraph(draftId)).toEqual(
        legacyBefore,
      );
      expect(
        (
          await sql`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY change_set_id,lock_version)::text,'')) AS hash FROM snapshot.entity_draft_save t`.execute(
            db,
          )
        ).rows,
      ).toEqual(snapshotBefore);
      const constraintsAfter = (
        await sql<{
          name: string;
          definition: string;
        }>`SELECT con.conname AS name,pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class t ON t.oid=con.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='metadata' AND t.relname IN ('entity_field','entity_runtime_profile','entity_surface','entity_surface_section','entity_surface_field_binding') ORDER BY con.conname`.execute(
          db,
        )
      ).rows;
      expect(
        constraintsAfter.filter((c) => !c.name.endsWith("_native_pending_ck")),
      ).toEqual(constraintsBefore);
      expect(
        constraintsAfter.filter((c) => c.name.endsWith("_native_pending_ck")),
      ).toHaveLength(5);
      await expect(
        db.transaction().execute((tx) => {
          const context = layoutFixtureContext();
          return prepareNormalizedCoreLayoutSave(
            tx,
            { changeSetId: draftId, entityId, tenantId: null },
            { core: context.core, layout: layoutFixture() },
            {
              ...context,
              coreContext: { ...context.coreContext, entityId, tenantId: null },
            },
          );
        }),
      ).rejects.toMatchObject({ code: "ENTITY_NATIVE_CUTOVER_NOT_QUALIFIED" });
      await expect(
        db.transaction().execute(async (tx) => {
          await sql`SELECT metadata.fn_advance_entity_change_set(${draftId}::uuid,12,${original}::uuid)`.execute(
            tx,
          );
          await sql`UPDATE metadata.entity_field SET label_id=${fixtureId(999)}::uuid WHERE change_set_id=${draftId}::uuid`.execute(
            tx,
          );
        }),
      ).rejects.toThrow("entity_field_native_pending_ck");
      expect((await referenceRepository.get(draftId))?.revision).toBe(12);
      expect(await referenceRepository.loadGraph(draftId)).toEqual(
        legacyBefore,
      );
    } finally {
      await db?.destroy();
      if (created) docker("rm", "-f", name);
    }
  },
  60_000,
);
