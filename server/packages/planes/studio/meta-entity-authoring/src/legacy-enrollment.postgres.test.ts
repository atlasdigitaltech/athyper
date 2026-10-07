import { validateLegacyFieldIdentityPlan } from "./legacy-field-lineage.js";
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
      // Exercise the canonical ownership command and forward guard in an
      // isolated rollback transaction before the older enrollment fixture.
      const rolledBack = new Error("OWNERSHIP_FIXTURE_ROLLBACK");
      await expect(
        db
          .transaction()
          .setIsolationLevel("serializable")
          .execute(async (tx) => {
            await sql
              .raw(read("planes/studio/metadata/29_native_root.generated.sql"))
              .execute(tx);
            await sql
              .raw(
                read(
                  "planes/studio/metadata/43_legacy_ownership_initialization.sql",
                ),
              )
              .execute(tx);
            const ownerActor = randomUUID(),
              ownerEntity = randomUUID(),
              ownerDraft = randomUUID(),
              ownerField = randomUUID();
            await sql`SELECT set_config('app.current_principal_id',${ownerActor},true)`.execute(
              tx,
            );
            await sql`INSERT INTO metadata.entity(id,module_id,entity_code,entity_class,ownership_model,created_by) VALUES(${ownerEntity}::uuid,${randomUUID()}::uuid,'ownership_fixture','reference','system',${ownerActor}::uuid)`.execute(
              tx,
            );
            await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by,default_locale,required_locales) VALUES(${ownerDraft}::uuid,${ownerEntity}::uuid,'ownership-fixture','Ownership fixture',${ownerActor}::uuid,'en',ARRAY['en'])`.execute(
              tx,
            );
            await sql`SELECT set_config('app.entity_change_set_write_token',${ownerDraft + ":0"},true)`.execute(
              tx,
            );
            await sql`INSERT INTO metadata.entity_runtime_profile(entity_id,change_set_id,backing_kind,storage_plane,storage_schema,storage_object,api_exposure,read_mode,write_mode,created_by) VALUES(${ownerEntity}::uuid,${ownerDraft}::uuid,'table','studio','reference','ownership_fixture','api','generic','none',${ownerActor}::uuid)`.execute(
              tx,
            );
            await sql`INSERT INTO metadata.entity_field(id,entity_id,change_set_id,field_key,data_type,type_config,write_mode,storage_path,created_by) VALUES(${ownerField}::uuid,${ownerEntity}::uuid,${ownerDraft}::uuid,'code','string','{"kind":"string"}'::jsonb,'read_only','code',${ownerActor}::uuid)`.execute(
              tx,
            );
            let deny = false,
              failAudit = false,
              audits = 0;
            const ownerPolicy = {
              schemaVersion: 1,
              authoringSchemaHash: "b".repeat(64),
              admit: async () => {
                if (deny) throw Error("OWNERSHIP_REVOKED");
              },
              audit: async () => {
                if (failAudit) throw Error("OWNERSHIP_AUDIT_FAILED");
                audits++;
              },
            };
            const ownerRepo = new KyselyMetaEntityAuthoringRepository(
              tx,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              ownerPolicy,
            );
            const source = await ownerRepo.loadGraph(ownerDraft);
            const request = {
              entityId: ownerEntity,
              changeSetId: ownerDraft,
              tenantId: null,
              actorId: ownerActor,
              expectedRevision: 0,
              expectedSourceHash: sha256(source),
              idempotencyKey: "ownership-fixture-command-001",
            };
            const result =
              await ownerRepo.executeLegacyOwnershipInitialization(request);
            expect(result).toMatchObject({
              revision: 1,
              sourceKind: "product",
              publicationOwner: "platform",
              replay: false,
            });
            expect(
              await ownerRepo.executeLegacyOwnershipInitialization(request),
            ).toEqual({ ...result, replay: true });
            expect(audits).toBe(2);
            expect(sha256(await ownerRepo.loadGraph(ownerDraft))).toBe(
              sha256(source),
            );
            const histories = (
              await sql`SELECT * FROM snapshot.entity_draft_save WHERE change_set_id=${ownerDraft}::uuid`.execute(
                tx,
              )
            ).rows;
            expect(histories).toHaveLength(2);
            deny = true;
            await expect(
              ownerRepo.executeLegacyOwnershipInitialization(request),
            ).rejects.toThrow("OWNERSHIP_REVOKED");
            deny = false;
            await expect(
              ownerRepo.executeLegacyOwnershipInitialization({
                ...request,
                expectedSourceHash: "0".repeat(64),
              }),
            ).rejects.toThrow("conflicts");
            await sql`SAVEPOINT repin`.execute(tx);
            await expect(
              sql`UPDATE metadata.entity_change_set SET authoring_schema_hash=${"c".repeat(64)} WHERE id=${ownerDraft}::uuid`.execute(
                tx,
              ),
            ).rejects.toThrow("OWNERSHIP_REPIN_FORBIDDEN");
            await sql`ROLLBACK TO SAVEPOINT repin`.execute(tx);
            const failedDraft = randomUUID();
            await sql`INSERT INTO metadata.entity_change_set(id,entity_id,change_set_code,title,created_by) VALUES(${failedDraft}::uuid,${ownerEntity}::uuid,'ownership-failed','Ownership failed',${ownerActor}::uuid)`.execute(
              tx,
            );
            const failedSource = await ownerRepo.loadGraph(failedDraft);
            failAudit = true;
            await expect(
              ownerRepo.executeLegacyOwnershipInitialization({
                ...request,
                changeSetId: failedDraft,
                expectedSourceHash: sha256(failedSource),
              }),
            ).rejects.toThrow("OWNERSHIP_AUDIT_FAILED");
            const failed = (
              await sql<{
                source_kind: string | null;
                lock_version: string;
              }>`SELECT source_kind,lock_version FROM metadata.entity_change_set WHERE id=${failedDraft}::uuid`.execute(
                tx,
              )
            ).rows[0];
            expect(failed).toEqual({ source_kind: null, lock_version: "0" });
            expect(
              (
                await sql`SELECT * FROM snapshot.entity_draft_save WHERE change_set_id=${failedDraft}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            expect(
              (
                await sql`SELECT * FROM metadata.entity_authoring_command_receipt WHERE change_set_id=${failedDraft}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            failAudit = false;
            await sql
              .raw("CREATE EXTENSION IF NOT EXISTS pgcrypto")
              .execute(tx);
            await sql
              .raw(
                read("planes/studio/snapshot/03_tables.sql").match(
                  /CREATE TABLE snapshot\.entity_contract_revision \([\s\S]*?\n\);/,
                )![0],
              )
              .execute(tx);
            await sql
              .raw(
                extract(
                  read("planes/studio/snapshot/07_functions.sql"),
                  "snapshot.fn_compute_entity_contract_hash",
                ),
              )
              .execute(tx);
            const identitySource = await ownerRepo.loadGraph(ownerDraft);
            const oldField = randomUUID(),
              oldRelease = randomUUID(),
              oldRevision = randomUUID();
            const historical = structuredClone(identitySource);
            historical.fields[0] = { ...historical.fields[0]!, id: oldField };
            const historicalJson = JSON.stringify(historical);
            const historicalHash = (
              await sql<{
                hash: string;
              }>`SELECT snapshot.fn_compute_entity_contract_hash(${historicalJson}::jsonb) AS hash`.execute(
                tx,
              )
            ).rows[0]!.hash;
            await sql`INSERT INTO snapshot.entity_contract_revision(id,entity_id,change_set_id,revision_no,contract_schema_code,contract_schema_version,contract_json,contract_hash,revision_hash,payload_size_bytes,validation_status,captured_by) VALUES(${oldRevision}::uuid,${ownerEntity}::uuid,${ownerDraft}::uuid,1,'athyper.meta-entity-contract','2.2',${historicalJson}::jsonb,${historicalHash},${"d".repeat(64)},${Buffer.byteLength(historicalJson)},'valid',${ownerActor}::uuid)`.execute(
              tx,
            );
            await sql`INSERT INTO metadata.entity_release(id,entity_id,change_set_id,revision_id,release_no,contract_schema_code,contract_schema_version,contract_hash,revision_hash,release_hash,compatibility_level,target_planes,published_by) VALUES(${oldRelease}::uuid,${ownerEntity}::uuid,${ownerDraft}::uuid,${oldRevision}::uuid,1,'athyper.meta-entity-contract','2.2',${historicalHash},${"d".repeat(64)},${"e".repeat(64)},'backward_compatible',ARRAY['studio'],${ownerActor}::uuid)`.execute(
              tx,
            );
            const reviewedReleases = [
              {
                releaseId: oldRelease,
                previousSourceHash: sha256(historical),
                mappings: [
                  { currentFieldId: ownerField, previousFieldId: oldField },
                ],
                rebindRequiredPreviousFieldIds: [],
              },
            ];
            const identityPlan = validateLegacyFieldIdentityPlan(
              identitySource,
              [{ releaseId: oldRelease, graph: historical }],
              {
                currentSourceHash: sha256(identitySource),
                releases: reviewedReleases,
              },
            );
            let reviewer = randomUUID(),
              reviewRevoked = false,
              identityAuditFails = false;
            const identityPolicy = {
              maximumBytes: 1000000,
              maximumReleases: 100,
              supportedLocales: ["en"],
              authoringSchemaHash: ownerPolicy.authoringSchemaHash,
              admit: ownerPolicy.admit,
              resolveReview: async () => {
                if (reviewRevoked) throw Error("REVIEW_REVOKED");
                return {
                  reviewerId: reviewer,
                  reviewReference: "fixture-review",
                  reviewHash: "c".repeat(64),
                  reviewedPlanHash: identityPlan.planHash,
                  releases: reviewedReleases,
                };
              },
              audit: async () => {
                if (identityAuditFails) throw Error("IDENTITY_AUDIT_FAILED");
              },
            };
            const identityRepo = new KyselyMetaEntityAuthoringRepository(
              tx,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              undefined,
              ownerPolicy,
              identityPolicy,
            );
            const identityRequest = {
              ...request,
              expectedRevision: 1,
              expectedSourceHash: sha256(identitySource),
              idempotencyKey: "identity-fixture-command-001",
            };
            identityAuditFails = true;
            await expect(
              identityRepo.executeLegacyIdentityInstallation(identityRequest),
            ).rejects.toThrow("IDENTITY_AUDIT_FAILED");
            expect(
              (
                await sql`SELECT id FROM metadata.entity_field_identity WHERE entity_id=${ownerEntity}::uuid`.execute(
                  tx,
                )
              ).rows,
            ).toEqual([]);
            identityAuditFails = false;
            const identityResult =
              await identityRepo.executeLegacyIdentityInstallation(
                identityRequest,
              );
            expect(identityResult.revision).toBe(2);
            expect(identityResult.bindings).toHaveLength(1);
            expect(identityResult.bindings[0]?.fieldId).toBe(ownerField);
            expect(
              (await identityRepo.loadGraph(ownerDraft)).contractSchema,
            ).toBe("athyper.meta-entity-contract/2.3");
            expect(
              await identityRepo.executeLegacyIdentityInstallation(
                identityRequest,
              ),
            ).toEqual({ ...identityResult, replay: true });
            reviewRevoked = true;
            await expect(
              identityRepo.executeLegacyIdentityInstallation(identityRequest),
            ).rejects.toThrow("REVIEW_REVOKED");
            reviewRevoked = false;
            reviewer = ownerActor;
            await expect(
              identityRepo.executeLegacyIdentityInstallation(identityRequest),
            ).rejects.toMatchObject({
              code: "LEGACY_IDENTITY_INDEPENDENT_REVIEW_REQUIRED",
            });
            throw rolledBack;
          }),
      ).rejects.toBe(rolledBack);
      // Minimal legacy compatibility coordinates, without native cutover guards.
      await sql
        .raw(
          "ALTER TABLE metadata.entity_change_set ADD COLUMN source_kind text, ADD COLUMN authoring_schema_hash text, ADD COLUMN native_core_layout_version integer",
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
