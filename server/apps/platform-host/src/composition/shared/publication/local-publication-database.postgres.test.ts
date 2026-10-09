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
          docker("exec", name, "pg_isready", "-U", "postgres");
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
CREATE TABLE metadata.entity_change_set(id uuid PRIMARY KEY,entity_id uuid,tenant_id uuid,source_kind text,native_core_layout_version int,created_by uuid,lock_version bigint,status text);
CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,tenant_id uuid,lock_version bigint,graph jsonb,graph_hash text);
CREATE TABLE metadata.entity_operation(id uuid,change_set_id uuid,entity_id uuid,tenant_id uuid,export_max_records bigint);
CREATE TABLE metadata.entity_field_identity(id uuid,entity_id uuid,tenant_id uuid);
CREATE TABLE metadata.entity_field(change_set_id uuid,field_identity_id uuid);
CREATE FUNCTION metadata.native_identity_available(uuid,uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION publication.fn_system_entity_authority(uuid,text) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'HUMAN_PATH_UNCHANGED'; END $$;
CREATE FUNCTION publication.fn_successor_canonical_json(v jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$ DECLARE result text; BEGIN
 CASE jsonb_typeof(v) WHEN 'object' THEN SELECT '{'||coalesce(string_agg(to_jsonb(key)::text||':'||publication.fn_successor_canonical_json(value),',' ORDER BY key),'')||'}' INTO result FROM jsonb_each(v);
 WHEN 'array' THEN SELECT '['||coalesce(string_agg(publication.fn_successor_canonical_json(value),',' ORDER BY ord),'')||']' INTO result FROM jsonb_array_elements(v) WITH ORDINALITY a(value,ord);
 ELSE result:=v::text; END CASE; RETURN result; END $$;
GRANT USAGE ON SCHEMA publication,metadata,snapshot,control,master,shared TO athyper_definer_product_publication,athyper_worker,athyper_control_api,athyper_runtime;
GRANT SELECT,UPDATE ON ALL TABLES IN SCHEMA metadata,snapshot,control,master TO athyper_definer_product_publication;
INSERT INTO master.principal VALUES('${developer}','${tenant}','user','active'),('${owner}','${tenant}','user','active'),('${author}','${tenant}','service_account','active'),('${publisher}','${tenant}','service_account','active');
INSERT INTO control.policy_definition VALUES('${authorityId}','${tenant}','metadata.publication','active','${authority.hash}',1,'${developer}','${owner}',CURRENT_DATE-1,NULL,'local-test');
INSERT INTO control.policy_rule VALUES('${authorityId}','allow','true',${literal({ schema: "athyper.local-publication-enrollment/1", standingAuthority: authority })});
INSERT INTO metadata.entity VALUES('${entity}',NULL,'system');
INSERT INTO metadata.entity_change_set VALUES('${draft}','${entity}',NULL,'product',2,'${developer}',1,'draft');
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
      const admit = `SELECT publication.admit_local_publication_request(${literal(request)});`;
      expect(
        q(
          `BEGIN; ${context("athyper_control_api", developer)} ${admit} ${admit} COMMIT;`,
        ),
      ).toContain(request.hash);
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
    } finally {
      try {
        docker("rm", "-f", name);
      } catch {}
    }
  },
  60_000,
);
