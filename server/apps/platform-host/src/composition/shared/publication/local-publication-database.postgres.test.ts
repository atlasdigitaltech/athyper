import { canonicalJson } from "@athyper/server-plane-studio-meta-entity-authoring";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  createLocalPublicationRequest,
  type LocalDevelopmentAuthority,
  type LocalPublicationAdmission,
} from "@athyper/server-contract-publication";

it.skipIf(process.env.LOCAL_PUBLICATION_POSTGRES !== "1")(
  "admits exact local requests under control role and rechecks native worker reads",
  async () => {
    const name = `local-publication-${randomUUID()}`;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const q = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-XqAt",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const literal = (v: unknown) =>
      `'${JSON.stringify(v).replaceAll("'", "''")}'::jsonb`;
    const ids = Array.from({ length: 8 }, () => randomUUID());
    const [
      tenant,
      developer,
      author,
      publisher,
      owner,
      authorityId,
      draft,
      entity,
    ] = ids as [string, string, string, string, string, string, string, string];
    const host = {
      environment: "local",
      instance: "dev",
      domainSuffix: "dev.athyper.test",
    };
    const graph = {
      authoringSource: { entityId: entity },
      contractSchema: "athyper.meta-entity-contract/2.5",
      entity: { entityClass: "reference", entityCode: "fixture_reference" },
      referenceMembers: { members: { target: [{ targetPlane: "neon" }] } },
    };
    const sourceHash = createHash("sha256")
      .update(JSON.stringify(graph))
      .digest("hex");
    const authority: LocalDevelopmentAuthority = {
      schema: "athyper.local-development-authority/1",
      id: authorityId,
      version: 1,
      hash: "a".repeat(64),
      active: true,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      enrollmentReceiptId: "fixture-enrollment-only",
      host,
      scope: { kind: "product" },
      developerPrincipalIds: [developer],
      authorWorkloadId: author,
      publisherWorkloadId: publisher,
      actions: ["publish", "retry", "recover", "rollback"],
      destinations: [{ plane: "neon", instance: "dev" }],
    };
    const policy = {
      schema: "athyper.local-publication-policy/1",
      policyId: "local-test",
      revision: 1,
      authorPrincipalId: author,
      publisherPrincipalId: publisher,
      authority: {
        host,
        scope: authority.scope,
        validFrom: authority.validFrom,
        expiresAt: authority.expiresAt,
        developerPrincipalIds: [developer],
        actions: authority.actions,
        destinations: authority.destinations,
      },
    };
    const condition = {
      and: Object.entries({
        environment: "dev",
        tenantId: tenant,
        policyHash: createHash("sha256")
          .update(canonicalJson(policy))
          .digest("hex"),
      }).map(([key, value]) => ({ "===": [{ var: key }, value] })),
    };
    const admission: LocalPublicationAdmission = {
      host,
      developerPrincipalId: developer,
      authorWorkloadId: author,
      publisherWorkloadId: publisher,
      scope: authority.scope,
      action: "publish",
      targets: authority.destinations,
    };
    const inputs = {
      changeSetId: draft,
      revision: 1,
      sourceHash,
      compilerHash: "b".repeat(64),
      release: {
        descriptorHash: createHash("sha256").update("{}").digest("hex"),
        predecessorReleaseId: null,
      },
      resourceHashes: [],
      targets: [
        {
          plane: "neon" as const,
          instance: "dev",
          predecessorHash: null,
          artifactHash: "c".repeat(64),
        },
      ],
    };
    const request = createLocalPublicationRequest(authority, admission, inputs);
    const context = (role: string, actor: string) =>
      `SET LOCAL ROLE ${role}; SELECT set_config('app.current_tenant_id','${tenant}',true),set_config('app.current_principal_id','${actor}',true);`;
    try {
      docker(
        "run",
        "--rm",
        "-d",
        "--name",
        name,
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:16",
      );
      for (let n = 0; n < 60; n++) {
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
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      q(`CREATE SCHEMA publication; CREATE SCHEMA metadata; CREATE SCHEMA snapshot; CREATE SCHEMA control; CREATE SCHEMA master; CREATE SCHEMA shared;
CREATE ROLE athyper_control_api; CREATE ROLE athyper_worker; CREATE ROLE athyper_runtime; CREATE ROLE athyper_publication_service; CREATE ROLE athyper_definer_product_publication NOLOGIN NOBYPASSRLS;
CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_principal_id',true),'')::uuid $$;
CREATE TABLE master.principal(id uuid, tenant_id uuid, principal_type text, status text);
CREATE TABLE control.policy_definition(id uuid PRIMARY KEY,tenant_id uuid,entity_type text,status text,definition_hash text,version_no int,created_by uuid,updated_by uuid,effective_from date,effective_until date,name text);
CREATE TABLE control.policy_rule(policy_definition_id uuid,action_code text,condition_expr jsonb,action_config jsonb);
CREATE TABLE metadata.entity(id uuid,tenant_id uuid,ownership_model text);
CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,source_kind text,native_core_layout_version int,created_by uuid,lock_version bigint,status text,submitted_by uuid,approved_by uuid,base_release_id uuid,status_changed_by uuid);
CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,tenant_id uuid,lock_version bigint,graph jsonb,graph_hash text);
CREATE TABLE metadata.entity_operation(id uuid,change_set_id uuid,entity_id uuid,tenant_id uuid,export_max_records bigint);
CREATE TABLE metadata.entity_field_identity(id uuid,entity_id uuid,tenant_id uuid);
CREATE TABLE metadata.entity_field(change_set_id uuid,field_identity_id uuid);
CREATE FUNCTION metadata.native_identity_available(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION publication.fn_system_entity_authority(uuid,text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HUMAN_PATH_UNCHANGED'; END $$;
CREATE FUNCTION publication.fn_successor_canonical_json(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE result text; BEGIN
 CASE jsonb_typeof(v) WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||publication.fn_successor_canonical_json(value),',' ORDER BY key COLLATE "C"),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(publication.fn_successor_canonical_json(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord);
 ELSE result:=v::text; END CASE; RETURN result; END $$;
GRANT USAGE ON SCHEMA publication,metadata,snapshot,control,master,shared TO athyper_definer_product_publication,athyper_worker,athyper_control_api,athyper_runtime;
GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA metadata,snapshot,control,master TO athyper_definer_product_publication;
INSERT INTO master.principal VALUES('${developer}','${tenant}','user','active'),('${owner}','${tenant}','user','active'),('${author}','${tenant}','service_account','active'),('${publisher}','${tenant}','service_account','active');
INSERT INTO control.policy_definition VALUES('${authorityId}','${tenant}','metadata.publication','active','${authority.hash}',1,'${developer}','${owner}',CURRENT_DATE-1,NULL,'local-test');
INSERT INTO control.policy_rule VALUES('${authorityId}','allow',${literal(condition)},${literal({ schema: "athyper.machine-publication-enrollment/1", environment: "dev", tenantId: tenant, policy })});
INSERT INTO metadata.entity VALUES('${entity}',NULL,'system');
INSERT INTO metadata.entity_change_set(id,entity_id,tenant_id,source_kind,native_core_layout_version,created_by,lock_version,status) VALUES('${draft}','${entity}',NULL,'product',2,'${developer}',1,'draft');
INSERT INTO snapshot.entity_draft_save VALUES('${draft}',NULL,1,${literal(graph)},'${sourceHash}');`);
      q(
        readFileSync(
          new URL(
            "../../../../../../db/ddl/planes/studio/publication/41_local_publication_request.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const sourceSql = readFileSync(
        new URL(
          "../../../../../../db/ddl/planes/studio/publication/37_native_worker_source.sql",
          import.meta.url,
        ),
        "utf8",
      ).split("CREATE FUNCTION publication.read_native_worker_component")[0]!;
      q(
        sourceSql +
          "ALTER FUNCTION publication.read_native_worker_source(uuid,integer) OWNER TO athyper_definer_product_publication;",
      );
      q(
        `INSERT INTO publication.local_publication_host VALUES(true,${literal(host)});`,
      );
      q(
        readFileSync(
          new URL(
            "../../../../../../db/ddl/planes/studio/publication/40_native_worker_entity_read.sql",
            import.meta.url,
          ),
          "utf8",
        ).split("GRANT SELECT")[0]!,
      );
      q(
        readFileSync(
          new URL(
            "../../../../../../db/ddl/planes/studio/publication/43_local_publication_dispatch.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const admit = `SELECT publication.admit_local_publication_request(${literal(request)});`;
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} ${admit} ${admit} COMMIT;`,
        ),
      ).toContain(request.hash);
      const commandId = randomUUID();
      const admitCommand = `SELECT publication.admit_local_publication_command(${literal(request)},'${commandId}');`;
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} ${admitCommand} ${admitCommand} SELECT publication.read_local_publication_admission('${commandId}')->>'hash'; COMMIT;`,
        ),
      ).toContain(request.hash);
      expect(
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT * FROM publication.pending_local_publication_requests(NULL,100); ROLLBACK;`,
        ),
      ).toContain(request.hash);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT * FROM publication.pending_local_publication_requests(NULL,100); ROLLBACK;`,
        ),
      ).toThrow(/permission denied/);
      expect(
        q(`BEGIN; ${context("athyper_worker", publisher)} SELECT set_config('app.local_publication_request_hash','${request.hash}',true);
        SELECT publication.native_worker_entity_visible('${entity}'),publication.native_worker_entity_visible('${owner}'); ROLLBACK;`),
      ).toContain("t|f");

      expect(
        q("SELECT count(*) FROM publication.local_publication_request;").trim(),
      ).toBe("1");
      const read = `SELECT publication.read_local_publication_request('${request.hash}')->>'basis'; SELECT set_config('app.local_publication_request_hash','${request.hash}',true); SELECT graph_hash FROM publication.read_native_worker_source('${draft}',4194304);`;
      expect(
        q(`BEGIN; ${context("athyper_worker", publisher)} ${read} ROLLBACK;`),
      ).toContain(sourceHash);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT * FROM metadata.entity_change_set; ROLLBACK;`,
        ),
      ).toThrow(/permission denied/);
      expect(() =>
        q(`BEGIN; ${context("athyper_worker", publisher)} ${admit} ROLLBACK;`),
      ).toThrow(/permission denied/);
      expect(() =>
        q(`BEGIN; ${context("athyper_worker", author)} ${read} ROLLBACK;`),
      ).toThrow(/no rows/);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT graph_hash FROM publication.read_native_worker_source('${draft}',4194304); ROLLBACK;`,
        ),
      ).toThrow(/HUMAN_PATH_UNCHANGED/);
      for (const mutation of [
        "UPDATE publication.local_publication_host SET identity=jsonb_set(identity,'{instance}','\"qa\"');",
        `UPDATE control.policy_definition SET status='revoked' WHERE id='${authorityId}';`,
        `UPDATE metadata.entity_change_set SET lock_version=2 WHERE id='${draft}';`,
        `UPDATE master.principal SET status='disabled' WHERE id='${developer}';`,
        `UPDATE control.policy_definition SET definition_hash=repeat('f',64) WHERE id='${authorityId}';`,
      ])
        expect(() =>
          q(
            `BEGIN; ${mutation} ${context("athyper_worker", publisher)} ${read} ROLLBACK;`,
          ),
        ).toThrow();
      expect(() =>
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal({ ...request, hash: "f".repeat(64) })}); ROLLBACK;`,
        ),
      ).toThrow(/HASH_INVALID/);
      const bad = createLocalPublicationRequest(authority, admission, {
        ...inputs,
        sourceHash: "f".repeat(64),
      });
      expect(() =>
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(bad)}); ROLLBACK;`,
        ),
      ).toThrow(/SOURCE_CHANGED/);
      q(
        `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(createLocalPublicationRequest(authority, admission, inputs, Date.now(), 60_000))}); ROLLBACK;`,
      );
      expect(
        q("SELECT count(*) FROM publication.local_publication_request;").trim(),
      ).toBe("1");
      // Exercise the real authority/validation/transition routines with a minimal
      // lifecycle fixture. This is not a full-schema deployed publication proof.
      const ddl = (file: string) =>
        readFileSync(
          new URL(
            `../../../../../../db/ddl/planes/studio/${file}`,
            import.meta.url,
          ),
          "utf8",
        );
      q(`CREATE DOMAIN metadata.contract_validation_status_d AS text;
CREATE DOMAIN metadata.entity_change_set_status_d AS text;
CREATE TABLE snapshot.entity_contract_revision(id uuid DEFAULT gen_random_uuid(),tenant_id uuid,entity_id uuid,change_set_id uuid,revision_no bigint,parent_revision_id uuid,parent_revision_hash text,base_release_id uuid,contract_schema_code text,contract_schema_version text,contract_json jsonb,contract_hash text,revision_hash text,payload_size_bytes bigint,validation_status text,validation_diagnostics jsonb,captured_by uuid);
ALTER TABLE snapshot.entity_draft_save ADD COLUMN captured_by uuid, ADD COLUMN capture_kind text;
GRANT SELECT,INSERT ON snapshot.entity_contract_revision,snapshot.entity_draft_save TO athyper_definer_product_publication;
CREATE FUNCTION metadata.fixture_status_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 NEW.lock_version:=OLD.lock_version+1;
 IF NEW.status='in_review' THEN NEW.submitted_by:=NEW.status_changed_by; END IF;
 IF NEW.status='approved' THEN NEW.approved_by:=NEW.status_changed_by; END IF;
 RETURN NEW; END $$;
CREATE TRIGGER fixture_status_revision BEFORE UPDATE OF status ON metadata.entity_change_set FOR EACH ROW EXECUTE FUNCTION metadata.fixture_status_revision();`);
      const capture = ddl("metadata/63_native_review_source.sql");
      q(
        capture.slice(
          capture.indexOf(
            "CREATE FUNCTION metadata.capture_native_review_revision",
          ),
          capture.indexOf("-- Exact installed component evidence"),
        ),
      );
      const native = ddl("publication/36_native_publication_authority.sql");
      q(
        native.slice(
          native.indexOf(
            "CREATE OR REPLACE FUNCTION publication.fn_system_entity_authority(",
          ),
          native.indexOf(
            "CREATE OR REPLACE FUNCTION publication.fn_create_system_entity_release(",
          ),
        ),
      );
      const commands = ddl("publication/15_system_entity_commands.sql");
      q(
        commands.slice(
          commands.indexOf(
            "CREATE OR REPLACE FUNCTION publication.fn_transition_system_entity_change_set(",
          ),
          commands.indexOf(
            "CREATE OR REPLACE FUNCTION publication.fn_create_system_entity_release(",
          ),
        ),
      );
      q(ddl("publication/42_local_publication_transitions.sql"));
      q(`ALTER FUNCTION publication.fn_system_entity_authority(uuid,text) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_transition_system_entity_change_set(uuid,bigint,text,text,uuid) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.fn_record_system_entity_validation(uuid,bigint,jsonb,jsonb,uuid),publication.fn_transition_system_entity_change_set(uuid,bigint,text,text,uuid) TO athyper_definer_product_publication;`);
      // Deferred invoker validation must finish before returning to the worker.
      q(`ALTER TABLE publication.local_publication_request ADD COLUMN execution_release_id uuid;
CREATE FUNCTION metadata.fixture_native_integrity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 PERFORM 1 FROM metadata.entity_change_set WHERE id=NEW.id;
 IF current_setting('app.fixture_invalid_graph',true)='true' THEN RAISE EXCEPTION 'FIXTURE_NATIVE_INTEGRITY_INVALID' USING ERRCODE='23514'; END IF;
 RETURN NEW; END $$;`);
      for (const guard of [
        "native_layout_final_guard",
        "native_core_final_guard",
        "native_root_final_guard",
        "native_snapshot_final_guard",
        "settings_locale_check",
      ]) {
        q(
          `CREATE CONSTRAINT TRIGGER ${guard} AFTER UPDATE ON metadata.entity_change_set DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION metadata.fixture_native_integrity();`,
        );
      }
      q(ddl("publication/53_local_publication_transition_validation.sql"));
      const report = { contractHash: sourceHash, issues: [] };
      const transition = (phase: string, validation = report) =>
        `SELECT publication.transition_local_publication_request('${request.hash}','${phase}',${literal(validation)});`;
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", publisher)} ${transition("submit")} ROLLBACK;`,
        ),
      ).toThrow(/PHASE_DENIED/);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", author)} ${transition("review")} ROLLBACK;`,
        ),
      ).toThrow(/PHASE_DENIED/);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", author)} ${transition("submit", { contractHash: "f".repeat(64), issues: [] })} ROLLBACK;`,
        ),
      ).toThrow(/VALIDATION_REQUIRED/);
      q(
        `BEGIN; ${context("athyper_worker", author)} ${transition("submit")} ROLLBACK;`,
      );
      expect(
        q(
          `SELECT status||':'||lock_version FROM metadata.entity_change_set WHERE id='${draft}';`,
        ).trim(),
      ).toBe("draft:1");
      expect(
        q("SELECT count(*) FROM snapshot.entity_contract_revision;").trim(),
      ).toBe("0");
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", author)} SELECT set_config('app.fixture_invalid_graph','true',true); ${transition("submit")} COMMIT;`,
        ),
      ).toThrow(/FIXTURE_NATIVE_INTEGRITY_INVALID/);
      expect(
        q(
          `SELECT status||':'||lock_version FROM metadata.entity_change_set WHERE id='${draft}';`,
        ).trim(),
      ).toBe("draft:1");
      expect(
        q(
          `BEGIN; ${context("athyper_worker", author)} ${transition("submit")} ${transition("submit")} COMMIT;`,
        ),
      ).toContain('"replayed": true');
      expect(
        q(
          `BEGIN; ${context("athyper_worker", publisher)} ${transition("review")} ${transition("review")} COMMIT;`,
        ),
      ).toContain('"replayed": true');
      expect(
        q(
          `SELECT status||':'||lock_version FROM metadata.entity_change_set WHERE id='${draft}';`,
        ).trim(),
      ).toBe("approved:3");
      expect(
        q(
          `BEGIN; ${context("athyper_worker", author)} ${transition("submit")} ROLLBACK;`,
        ),
      ).toContain('"replayed": true');
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} ${admit} ROLLBACK;`,
        ),
      ).toContain(request.hash);
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.read_local_publication_admission('${commandId}')->>'hash'; ROLLBACK;`,
        ),
      ).toContain(request.hash);
      expect(
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT count(*) FROM publication.pending_local_publication_requests(NULL,100); ROLLBACK;`,
        )
          .trim()
          .split("\n")
          .at(-1),
      ).toBe("0");
      expect(
        q(
          `SELECT count(*),count(DISTINCT graph::text) FROM snapshot.entity_draft_save WHERE change_set_id='${draft}';`,
        ).trim(),
      ).toBe("3|1");
      expect(
        q(`BEGIN; ${context("athyper_worker", publisher)} ${read} ROLLBACK;`),
      ).toContain(sourceHash);
      expect(() =>
        q(
          `BEGIN; UPDATE control.policy_definition SET status='revoked' WHERE id='${authorityId}'; ${context("athyper_worker", publisher)} ${transition("review")} ROLLBACK;`,
        ),
      ).toThrow();
      expect(() =>
        q(
          `BEGIN; UPDATE metadata.entity_change_set SET lock_version=4 WHERE id='${draft}'; ${context("athyper_worker", publisher)} ${read} ROLLBACK;`,
        ),
      ).toThrow(/SOURCE_CHANGED/);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT set_config('app.local_publication_request_hash','${request.hash}',true); SELECT publication.fn_system_entity_authority('${draft}','release'); ROLLBACK;`,
        ),
      ).toThrow(/permission denied|NOT_CONFIGURED/);
      // Release execution uses the same signed-source writer and immutable
      // snapshot/link validation. The reduced tables below isolate that boundary;
      // they do not attest a deployed full-schema native publication.
      q(`CREATE TABLE metadata.entity_release(id uuid PRIMARY KEY,tenant_id uuid,entity_id uuid,change_set_id uuid,revision_id uuid,release_no bigint,release_kind text,supersedes_release_id uuid,contract_schema_code text,contract_schema_version text,contract_hash text,revision_hash text,release_hash text,compatibility_level text,target_planes text[],signature_algorithm text,signing_key_id text,contract_signature text,published_by uuid);
CREATE TABLE publication.release(id uuid,tenant_id uuid,release_key text,release_no bigint,release_hash text,release_kind text,created_by uuid,metadata jsonb,status text);
CREATE TABLE publication.entity_release_link(publication_release_id uuid,entity_release_id uuid);
ALTER TABLE metadata.entity ADD COLUMN entity_code text;
UPDATE metadata.entity SET entity_code='fixture_reference';
GRANT SELECT,INSERT ON metadata.entity_release,publication.release TO athyper_definer_product_publication;
CREATE FUNCTION metadata.fixture_publish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE metadata.entity_change_set SET status='published',status_changed_by=NEW.published_by WHERE id=NEW.change_set_id;
 RETURN NEW; END $$;
CREATE TRIGGER fixture_publish AFTER INSERT ON metadata.entity_release FOR EACH ROW EXECUTE FUNCTION metadata.fixture_publish();`);
      const linkStart = commands.indexOf(
        "CREATE OR REPLACE FUNCTION publication.fn_link_system_entity_release(",
      );
      q(commands.slice(linkStart, commands.indexOf("END $$;", linkStart) + 7));
      q(
        "ALTER TABLE publication.local_publication_request DROP COLUMN execution_release_id",
      );
      q(ddl("publication/44_local_publication_release.sql"));
      q(
        `CREATE TRIGGER entity_release_link_native_validation AFTER INSERT ON publication.entity_release_link FOR EACH ROW EXECUTE FUNCTION publication.finish_native_publication_validation();`,
      );
      q(ddl("publication/53_local_publication_transition_validation.sql"));
      q(
        "ALTER TABLE master.principal ADD COLUMN provisioning_source text DEFAULT 'internal'",
      );
      q(ddl("publication/45_local_publication_identity_status.sql"));
      q(ddl("publication/56_local_publication_hash_domains.sql"));
      q(ddl("publication/58_local_publication_request_renewal.sql"));
      const renewal = createLocalPublicationRequest(
        authority,
        admission,
        { ...inputs, revision: 3 },
        Date.now(),
        60_000,
      );
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(renewal)}); RESET ROLE; SELECT execution_status||':'||execution_revision||':'||renewed_from_hash FROM publication.local_publication_request WHERE request_hash='${renewal.hash}'; ROLLBACK;`,
        ),
      ).toContain(`approved:3:${request.hash}`);
      expect(() =>
        q(
          `BEGIN; UPDATE publication.local_publication_request SET execution_revision=NULL,execution_status=NULL; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(renewal)}); ROLLBACK;`,
        ),
      ).toThrow(/RENEWAL_PROGRESS_REQUIRED/);
      expect(
        q(
          `SELECT count(*) FROM publication.local_publication_request WHERE request_hash='${renewal.hash}';`,
        ).trim(),
      ).toBe("0");

      const expiring = createLocalPublicationRequest(
        authority,
        admission,
        { ...inputs, revision: 3 },
        Date.now(),
        1000,
      );
      q(
        `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(expiring)}); COMMIT; SELECT pg_sleep(1.1);`,
      );
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", publisher)} SELECT publication.read_local_publication_request('${expiring.hash}'); ROLLBACK;`,
        ),
      ).toThrow(/REQUEST_EXPIRED/);
      const renewed = createLocalPublicationRequest(authority, admission, {
        ...inputs,
        revision: 3,
      });
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.admit_local_publication_request(${literal(renewed)}); RESET ROLE; SELECT renewed_from_hash FROM publication.local_publication_request WHERE request_hash='${renewed.hash}'; ROLLBACK;`,
        ),
      ).toContain(expiring.hash);
      expect(
        JSON.parse(
          q(
            `SELECT request_json FROM publication.local_publication_request WHERE request_hash='${expiring.hash}';`,
          ),
        ),
      ).toEqual(expiring);
      // The real metadata trigger computes a ledger hash, not a descriptor digest.
      q(`CREATE FUNCTION metadata.fixture_release_hash() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.release_hash:=repeat('b',64); RETURN NEW; END $$;
CREATE TRIGGER fixture_release_hash BEFORE INSERT ON metadata.entity_release FOR EACH ROW EXECUTE FUNCTION metadata.fixture_release_hash();`);
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.local_publication_identity_status(ARRAY['${developer}']::uuid[],'${author}','${publisher}'); ROLLBACK;`,
        )
          .trim()
          .split("\n")
          .at(-1),
      ).toBe("t");
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} SELECT publication.local_publication_identity_status(ARRAY['${developer}','${developer}']::uuid[],'${author}','${publisher}'); ROLLBACK;`,
        )
          .trim()
          .split("\n")
          .at(-1),
      ).toBe("f");

      q(`ALTER FUNCTION publication.fn_link_system_entity_release(uuid) OWNER TO athyper_definer_product_publication;
GRANT SELECT,INSERT ON publication.entity_release_link TO athyper_definer_product_publication;
CREATE TRIGGER fixture_link BEFORE INSERT ON publication.entity_release_link FOR EACH ROW EXECUTE FUNCTION publication.trg_validate_entity_release_link();`);
      q(`ALTER FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid) OWNER TO athyper_definer_product_publication;
ALTER FUNCTION publication.fn_system_entity_execution_metadata(uuid) OWNER TO athyper_definer_product_publication;
GRANT EXECUTE ON FUNCTION publication.fn_create_system_entity_release(uuid,uuid,bigint,jsonb,text[],uuid),publication.fn_system_entity_execution_metadata(uuid) TO athyper_worker;`);
      const releaseId = randomUUID();
      const artifact = {
        contractHash: sourceHash,
        descriptorHash: inputs.release.descriptorHash,
        descriptor: {},
        signatureAlgorithm: "Ed25519",
        signingKeyId: "fixture-key",
        signature: "fixture-signature",
      };
      const scoped = `${context("athyper_worker", publisher)} SELECT set_config('app.local_publication_request_hash','${request.hash}',true);`;
      const createRelease = (value = artifact) =>
        `SELECT id FROM publication.fn_create_system_entity_release('${releaseId}','${draft}',3,${literal(value)},ARRAY['neon'],'${publisher}');`;
      expect(() =>
        q(
          `BEGIN; ${scoped} ${createRelease({ ...artifact, descriptorHash: "f".repeat(64) })} ROLLBACK;`,
        ),
      ).toThrow(/SIGNED_SOURCE_MISMATCH/);
      expect(() =>
        q(
          `BEGIN; ${context("athyper_worker", author)} SELECT set_config('app.local_publication_request_hash','${request.hash}',true); ${createRelease()} ROLLBACK;`,
        ),
      ).toThrow(/PHASE_DENIED/);
      q(`BEGIN; ${scoped} ${createRelease()} ROLLBACK;`);
      expect(q("SELECT count(*) FROM metadata.entity_release;").trim()).toBe(
        "0",
      );
      expect(
        q(
          `SELECT execution_status FROM publication.local_publication_request WHERE request_hash='${request.hash}';`,
        ).trim(),
      ).toBe("approved");
      const link = `RESET ROLE; INSERT INTO publication.release VALUES('${releaseId}','${tenant}','metadata.reference.fixture_reference',1,repeat('b',64),'publish','${publisher}',
 jsonb_build_object('sourceContractHash','${sourceHash}','sourceDescriptorHash','${artifact.descriptorHash}','productHash','${sourceHash}') || publication.fn_system_entity_execution_metadata('${releaseId}'),'approved');
 ${scoped} SELECT publication.fn_link_system_entity_release('${releaseId}');`;
      expect(
        q(
          `BEGIN; ${scoped} ${createRelease()} ${link} SELECT publication.local_publication_release_receipt('${request.hash}'); COMMIT;`,
        ),
      ).toContain(releaseId);
      expect(
        q(
          `BEGIN; ${scoped} SELECT publication.local_publication_release_receipt('${request.hash}'); SELECT publication.local_publication_execution_context('${releaseId}')->>'basis'; ${transition("review")} ROLLBACK;`,
        ),
      ).toContain('"replayed": true');
      expect(() =>
        q(
          `BEGIN; UPDATE publication.release SET metadata=jsonb_set(metadata,'{localPublicationRequest,hash}','"wrong"'); ${scoped} SELECT publication.local_publication_execution_context('${releaseId}'); ROLLBACK;`,
        ),
      ).toThrow(/COMMITTED_RELEASE_REQUIRED/);
      expect(
        q(
          `SELECT execution_status||':'||execution_revision||':'||execution_release_id FROM publication.local_publication_request WHERE request_hash='${request.hash}';`,
        ).trim(),
      ).toBe(`published:4:${releaseId}`);
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} ${admit} ROLLBACK;`,
        ),
      ).toContain(request.hash);
      expect(() => q(`BEGIN; ${scoped} ${createRelease()} ROLLBACK;`)).toThrow(
        /PHASE_DENIED/,
      );
      expect(
        q(
          `SELECT count(*),count(DISTINCT graph::text) FROM snapshot.entity_draft_save WHERE change_set_id='${draft}';`,
        ).trim(),
      ).toBe("4|1");
    } finally {
      try {
        docker("rm", "-f", name);
      } catch {}
    }
  },
  60_000,
);
