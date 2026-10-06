import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import { expect, it } from "vitest";
import { KyselyMetaEntityAuthoringRepository } from "./kysely-authoring-repository.js";
import { loadNormalizedLabels } from "./normalized-label-storage.js";
import { loadFieldIdentities } from "./normalized-reference-storage.js";
import { sha256 } from "./deterministic.js";
import type { NativeAuthoringPolicy } from "./native-core-layout-persistence.js";
import type { LegacyEnrollmentApplicationPolicy } from "./legacy-enrollment-application.js";
const enabled = process.env.ATHYPER_LEGACY_ENROLLMENT_POSTGRES === "1";
const read = (path: string) =>
  readFileSync(
    new URL("../../../../../db/ddl/" + path, import.meta.url),
    "utf8",
  ).replace(/^\uFEFF/, "");
const docker = (...args: string[]) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();
/** Actual canonical legacy tables, marker/receipt/history guards, root revision
 * protocol and repository loader. UUID bootstrap and host admission/qualification
 * are synthetic; superuser execution is NOT product-write or native cutover,
 * approved host, whole-product conversion or deployed F6/F8/F9 qualification. */
it.skipIf(!enabled)(
  "applies enrollment with canonical guards, exact history/readback, replay and rollback",
  async () => {
    const name = "athyper-enrollment-" + randomUUID();
    let created = false;
    let db: Kysely<Record<string, never>> | undefined;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=legacy-enrollment-test",
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
          await new Promise((r) => setTimeout(r, 200));
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
          "CREATE SCHEMA metadata; CREATE SCHEMA snapshot; CREATE SCHEMA shared; CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()'",
        )
        .execute(db);
      await sql.raw(read("planes/studio/metadata/02_domains.sql")).execute(db);
      await sql.raw(read("planes/studio/metadata/03_tables.sql")).execute(db);
      const functions = read("planes/studio/metadata/07_functions.sql");
      const extract = (text: string, name: string) => {
        const escaped = name.replace(/\./g, "\\.");
        const result = text.match(
          new RegExp(
            "CREATE (?:OR REPLACE )?FUNCTION " +
              escaped +
              "\\([\\s\\S]*?\\$\\$;",
          ),
        );
        if (!result) throw Error("Canonical function missing: " + name);
        return result[0];
      };
      for (const f of [
        "metadata.current_actor_id",
        "metadata.trg_guard_entity_change_set",
        "metadata.fn_advance_entity_change_set",
        "metadata.trg_guard_entity_graph_row",
      ])
        await sql.raw(extract(functions, f)).execute(db);
      await sql
        .raw(
          extract(
            read("common/shared/07_functions.sql"),
            "shared.trg_set_updated_at",
          ),
        )
        .execute(db);
      await sql
        .raw(
          "CREATE TRIGGER trg_entity_change_set_10_guard BEFORE INSERT OR UPDATE ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION metadata.trg_guard_entity_change_set(); CREATE TRIGGER trg_entity_change_set_90_updated_at BEFORE UPDATE ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()",
        )
        .execute(db);
      await sql
        .raw(read("planes/studio/metadata/23_owned_label_authoring.sql"))
        .execute(db);
      await sql
        .raw(read("planes/studio/metadata/24_reference_members.generated.sql"))
        .execute(db);
      await sql
        .raw(read("planes/studio/metadata/25_reference_member_guards.sql"))
        .execute(db);
      await sql
        .raw(read("planes/studio/metadata/30_entity_root_revision.sql"))
        .execute(db);
      await sql
        .raw(
          read("planes/studio/metadata/31_entity_root_revision_provenance.sql"),
        )
        .execute(db);
      // Minimal legacy compatibility coordinates, without native cutover guards.
      await sql
        .raw(
          "ALTER TABLE metadata.entity_change_set ADD COLUMN source_kind text, ADD COLUMN authoring_schema_hash text, ADD COLUMN native_core_layout_version integer",
        )
        .execute(db);
      const snapshot = read("planes/studio/snapshot/03_tables.sql").match(
        /CREATE TABLE snapshot\.entity_draft_save \([\s\S]*?\n\);/,
      )![0];
      await sql.raw(snapshot).execute(db);
      await sql
        .raw(
          extract(
            read("planes/studio/snapshot/07_functions.sql"),
            "snapshot.guard_entity_draft_save",
          ),
        )
        .execute(db);
      await sql
        .raw(
          "CREATE TRIGGER entity_draft_save_immutable BEFORE UPDATE OR DELETE ON snapshot.entity_draft_save FOR EACH ROW EXECUTE FUNCTION snapshot.guard_entity_draft_save()",
        )
        .execute(db);
      const entityId = randomUUID(),
        actorId = randomUUID(),
        identityId = randomUUID(),
        schemaHash = "a".repeat(64);
      await sql`INSERT INTO metadata.entity(id,module_id,entity_code,entity_class,ownership_model,created_by) VALUES(${entityId}::uuid,${randomUUID()}::uuid,${"enrollment_fixture"},'reference','system',${actorId}::uuid)`.execute(
        db,
      );
      const setup = async () => {
        const changeSetId = randomUUID();
        await db!.transaction().execute(async (tx) => {
          await sql`SELECT set_config('app.current_principal_id',${actorId},true),set_config('app.entity_change_set_write_token',${changeSetId + ":7"},true)`.execute(
            tx,
          );
          await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by,lock_version,default_locale,required_locales,source_kind,authoring_schema_hash) VALUES(${changeSetId}::uuid,${entityId}::uuid,${"draft-" + changeSetId},'Enrollment fixture',${actorId}::uuid,7,'en',ARRAY['en'],'product',${schemaHash})`.execute(
            tx,
          );
          await sql`INSERT INTO metadata.entity_runtime_profile(entity_id,change_set_id,backing_kind,storage_plane,storage_schema,storage_object,api_exposure,read_mode,write_mode,created_by) VALUES(${entityId}::uuid,${changeSetId}::uuid,'table','studio','reference','enrollment_fixture','api','generic','none',${actorId}::uuid)`.execute(
            tx,
          );
          const existing = (
            await sql`SELECT id FROM metadata.entity_field_identity WHERE id=${identityId}::uuid`.execute(
              tx,
            )
          ).rows.length;
          if (!existing)
            await sql`INSERT INTO metadata.entity_field_identity(id,entity_id,field_key,identity_status,introduced_change_set_id,created_by) VALUES(${identityId}::uuid,${entityId}::uuid,'code','reserved',${changeSetId}::uuid,${actorId}::uuid)`.execute(
              tx,
            );
          await sql`INSERT INTO metadata.entity_field(id,entity_id,change_set_id,field_key,data_type,type_config,write_mode,storage_path,created_by,field_identity_id) VALUES(${randomUUID()}::uuid,${entityId}::uuid,${changeSetId}::uuid,'code','string','{"kind":"string"}'::jsonb,'read_only','code',${actorId}::uuid,${identityId}::uuid)`.execute(
            tx,
          );
        });
        return changeSetId;
      };
      const changeSetId = await setup();
      let rejectAdmission = false,
        rejectQualification = false;
      const policy: LegacyEnrollmentApplicationPolicy = {
        host: {
          commands: { authoringSchemaHash: schemaHash },
          admit: async (tx: Transaction<Record<string, never>>) => {
            if (rejectAdmission) throw Error("Admission revoked");
            await sql`SELECT set_config('app.current_principal_id',${actorId},true)`.execute(
              tx,
            );
          },
        } as unknown as NativeAuthoringPolicy,
        qualify: async () => {
          if (rejectQualification) throw Error("Qualification revoked");
        },
        resolve: async (tx, input, source) => ({
          sourceHash: input.expectedSourceHash,
          revision: input.expectedRevision,
          sourceKind: "product",
          maximumBytes: 1000000,
          context: {
            entityId,
            changeSetId: input.changeSetId,
            tenantId: null,
            supportedLocales: ["en"],
          },
          labels: (await loadNormalizedLabels(tx, input.changeSetId))!,
          identities: await loadFieldIdentities(tx, input.changeSetId),
        }),
      };
      const repo = new KyselyMetaEntityAuthoringRepository(
        db,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        policy,
      );
      const source = await repo.loadGraph(changeSetId);
      const input = {
        entityId,
        changeSetId,
        tenantId: null,
        actorId,
        expectedRevision: 7,
        expectedSourceHash: sha256(source),
        idempotencyKey: "legacy-enrollment-first-0001",
      };
      const beforeFields = (
        await sql`SELECT to_jsonb(f) AS row FROM metadata.entity_field f`.execute(
          db,
        )
      ).rows;
      const result = await repo.executeLegacyEnrollment(input);
      expect(result.revision).toBe(8);
      expect(result.replay).toBe(false);
      expect(
        (
          await sql<{
            lock_version: string;
          }>`SELECT lock_version FROM metadata.entity_change_set WHERE id=${changeSetId}::uuid`.execute(
            db,
          )
        ).rows[0]!.lock_version,
      ).toBe("8");
      expect(
        (
          await sql`SELECT to_jsonb(f) AS row FROM metadata.entity_field f`.execute(
            db,
          )
        ).rows,
      ).toEqual(beforeFields);
      const stored = await repo.loadGraph(changeSetId);
      expect(stored.contractSchema).toBe("athyper.meta-entity-contract/2.3");
      expect(sha256(stored)).toBe(result.targetHash);
      const histories = (
        await sql<{
          graph: unknown;
          graph_hash: string;
        }>`SELECT graph,graph_hash FROM snapshot.entity_draft_save WHERE change_set_id=${changeSetId}::uuid ORDER BY lock_version`.execute(
          db,
        )
      ).rows;
      expect(histories).toHaveLength(2);
      expect(histories[0]!.graph).toEqual(source);
      expect(histories[1]!.graph).toEqual(stored);
      expect(await repo.executeLegacyEnrollment(input)).toEqual({
        ...result,
        replay: true,
      });
      rejectQualification = true;
      await expect(repo.executeLegacyEnrollment(input)).rejects.toThrow(
        "Qualification revoked",
      );
      rejectQualification = false;
      rejectAdmission = true;
      await expect(repo.executeLegacyEnrollment(input)).rejects.toThrow(
        "Admission revoked",
      );
      rejectAdmission = false;
      await expect(
        repo.executeLegacyEnrollment({
          ...input,
          expectedSourceHash: "b".repeat(64),
        }),
      ).rejects.toThrow("idempotency key conflicts");
      await expect(
        sql`DELETE FROM snapshot.entity_draft_save WHERE change_set_id=${changeSetId}::uuid`.execute(
          db,
        ),
      ).rejects.toThrow("immutable");
      // The protocol token must never suppress substantive or review changes.
      let rootJson = (
        await sql<{
          root: Record<string, unknown>;
        }>`SELECT to_jsonb(cs) AS root FROM metadata.entity_change_set cs WHERE id=${changeSetId}::uuid`.execute(
          db,
        )
      ).rows[0]!.root;
      await db.transaction().execute(async (tx) => {
        await sql`SELECT set_config('app.entity_change_set_write_token',${changeSetId + ":8"},true)`.execute(
          tx,
        );
        expect(
          (
            await sql<{
              keeps: boolean;
            }>`SELECT metadata.entity_root_patch_keeps_revision(${JSON.stringify(rootJson)}::jsonb,${JSON.stringify({ ...rootJson, default_locale: "ms" })}::jsonb) AS keeps`.execute(
              tx,
            )
          ).rows[0]!.keeps,
        ).toBe(false);
        await sql`SAVEPOINT revision_provenance_checks`.execute(tx);
        await sql`SELECT metadata.fn_advance_entity_change_set(${changeSetId}::uuid,8,${actorId}::uuid)`.execute(
          tx,
        );
        rootJson = (
          await sql<{
            root: Record<string, unknown>;
          }>`SELECT to_jsonb(cs) AS root FROM metadata.entity_change_set cs WHERE id=${changeSetId}::uuid`.execute(
            tx,
          )
        ).rows[0]!.root;
        for (const patch of [
          { title: "Changed title" },
          { status: "in_review" },
          { source_kind: "tenant_entity" },
          { created_by: randomUUID() },
          { lock_version: Number(rootJson.lock_version) + 1 },
          { publication_owner: "tenant" },
        ]) {
          expect(
            (
              await sql<{
                keeps: boolean;
              }>`SELECT metadata.entity_root_patch_keeps_revision(${JSON.stringify(rootJson)}::jsonb,${JSON.stringify({ ...rootJson, ...patch })}::jsonb) AS keeps`.execute(
                tx,
              )
            ).rows[0]!.keeps,
          ).toBe(false);
        }
        expect(
          (
            await sql<{
              keeps: boolean;
            }>`SELECT metadata.entity_root_patch_keeps_revision(${JSON.stringify(rootJson)}::jsonb,${JSON.stringify({ ...rootJson, default_locale: "ms" })}::jsonb) AS keeps`.execute(
              tx,
            )
          ).rows[0]!.keeps,
        ).toBe(true);
        await sql`SELECT set_config('app.entity_change_set_write_token','',true)`.execute(
          tx,
        );
        expect(
          (
            await sql<{
              keeps: boolean;
            }>`SELECT metadata.entity_root_patch_keeps_revision(${JSON.stringify(rootJson)}::jsonb,${JSON.stringify({ ...rootJson, default_locale: "ms" })}::jsonb) AS keeps`.execute(
              tx,
            )
          ).rows[0]!.keeps,
        ).toBe(false);
        await sql`ROLLBACK TO SAVEPOINT revision_provenance_checks`.execute(tx);
        await sql`RELEASE SAVEPOINT revision_provenance_checks`.execute(tx);
      });
      // A later failure must undo marker/revision/history/receipt in a real SQL tx.
      const rollbackDraft = randomUUID();
      await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by,lock_version,default_locale,required_locales,source_kind,authoring_schema_hash) VALUES(${rollbackDraft}::uuid,${entityId}::uuid,${"draft-" + rollbackDraft},'Rollback fixture',${actorId}::uuid,7,'en',ARRAY['en'],'product',${schemaHash})`.execute(
        db,
      );
      await sql`INSERT INTO metadata.entity_runtime_profile(entity_id,change_set_id,backing_kind,storage_plane,storage_schema,storage_object,api_exposure,read_mode,write_mode,created_by) VALUES(${entityId}::uuid,${rollbackDraft}::uuid,'table','studio','reference','enrollment_fixture','api','generic','none',${actorId}::uuid)`.execute(
        db,
      );
      const rollbackSource = await repo.loadGraph(rollbackDraft);
      await db.transaction().execute(async (tx) => {
        await sql
          .raw(
            "CREATE FUNCTION snapshot.reject_enrollment_saved() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.capture_kind='saved' THEN RAISE EXCEPTION 'Late capture rejected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_enrollment_saved BEFORE INSERT ON snapshot.entity_draft_save FOR EACH ROW EXECUTE FUNCTION snapshot.reject_enrollment_saved()",
          )
          .execute(tx);
        const transactional = new KyselyMetaEntityAuthoringRepository(
          tx,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          policy,
        );
        await expect(
          transactional.executeLegacyEnrollment({
            ...input,
            changeSetId: rollbackDraft,
            expectedSourceHash: sha256(rollbackSource),
            idempotencyKey: "legacy-enrollment-rollback-0001",
          }),
        ).rejects.toThrow("Late capture rejected");
        const root = (
          await sql<{
            lock_version: string;
            reference_contract_version: number | null;
          }>`SELECT lock_version,reference_contract_version FROM metadata.entity_change_set WHERE id=${rollbackDraft}::uuid`.execute(
            tx,
          )
        ).rows[0]!;
        expect(root).toEqual({
          lock_version: "7",
          reference_contract_version: null,
        });
        expect(
          (
            await sql`SELECT * FROM snapshot.entity_draft_save WHERE change_set_id=${rollbackDraft}::uuid`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
        expect(
          (
            await sql`SELECT * FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${rollbackDraft}::uuid`.execute(
              tx,
            )
          ).rows,
        ).toEqual([]);
      });
    } finally {
      if (db) await db.destroy();
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
