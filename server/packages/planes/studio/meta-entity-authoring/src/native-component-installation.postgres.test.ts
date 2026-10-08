import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { componentSourceFixture } from "./native-component-publication.fixtures.js";

/** Canonical catalogue and installation routines; synthetic reviewed/active rows.
 * Tests database authority and atomicity, not cryptographic host qualification. */
it.skipIf(process.env.ATHYPER_COMPONENT_INSTALLATION_POSTGRES !== "1")(
  "installs only exact reviewed active component projections with rollback and immutable replay",
  async () => {
    const name = "athyper-constraint-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const read = (name: string) =>
      readFileSync(
        new URL(
          "../../../../../db/ddl/planes/studio/metadata/" + name,
          import.meta.url,
        ),
        "utf8",
      ).replace(/^\uFEFF/, "");
    let created = false;
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--tmpfs",
        "/var/lib/postgresql/data",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        process.env.ATHYPER_TEST_POSTGRES_IMAGE ?? "postgres:16.15-bookworm",
      );
      created = true;
      for (let i = 0; i < 100; i++)
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
          if (i === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 200));
        }
      const query = (source: string) =>
        execFileSync(
          "docker",
          [
            "exec",
            "-i",
            name,
            "psql",
            "-h",
            "127.0.0.1",
            "-X",
            "-At",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
          ],
          { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
        );
      query(`CREATE SCHEMA metadata;CREATE SCHEMA publication;CREATE SCHEMA runtime_meta;CREATE SCHEMA shared;
        CREATE ROLE athyper_publication_service NOLOGIN;CREATE ROLE component_client LOGIN;GRANT athyper_publication_service TO component_client;
        GRANT USAGE ON SCHEMA publication TO athyper_publication_service;
        CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('app.current_tenant_id',true),'')::uuid $$;
        CREATE TABLE publication.release(id uuid,tenant_id uuid,status text,release_key text,release_no bigint,release_hash text,approved_at timestamptz,approved_by uuid,created_by uuid,metadata jsonb);
        CREATE TABLE publication.artifact(id uuid,publication_release_id uuid,artifact_kind text,content_hash text,plane_code text,artifact_uri text,signature_algorithm text,signing_key_id text,signature text);
        CREATE TABLE publication.deployment(id uuid,artifact_id uuid,target_plane text,target_environment text,target_instance text,status text);
        CREATE TABLE runtime_meta.applied_release(id uuid,publication_key text,source_release_id uuid,source_release_no bigint,deployment_id uuid,artifact_hash text,status text,manifest jsonb,verification_evidence jsonb);
        CREATE TABLE runtime_meta.release_activation_head(applied_release_id uuid,publication_key text,source_release_no bigint,artifact_hash text);
        CREATE TABLE runtime_meta.applied_release_payload(applied_release_id uuid,artifact_kind text,tenant_id uuid,payload_hash text,payload_json jsonb,coordinates jsonb);`);
      query(read("41_ui_component_catalogue.generated.sql"));
      query(
        readFileSync(
          new URL(
            "../../../../../db/ddl/planes/studio/publication/35_component_catalogue_installation.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      const source = componentSourceFixture();
      const id = randomUUID(),
        tenant = randomUUID(),
        author = randomUUID(),
        reviewer = randomUUID(),
        artifact = randomUUID(),
        deployment = randomUUID();
      const hash = "a".repeat(64);
      const json = (v: unknown) =>
        "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
      query(`INSERT INTO publication.release VALUES('${id}','${tenant}','approved','shared.text',1,'${hash}',now(),'${reviewer}','${author}',${json({ artifactKind: "entity_ui_component", authoringResourceSource: { payload: source } })});
        INSERT INTO publication.artifact VALUES('${artifact}','${id}','entity_ui_component','${hash}','studio','fixture://component','Ed25519','fixture','fixture');
        INSERT INTO publication.deployment VALUES('${deployment}','${artifact}','studio','local','test','verified');
        INSERT INTO runtime_meta.applied_release VALUES('${id}','shared.text','${id}',1,'${deployment}','${hash}','active',${json({ artifactKind: "entity_ui_component", payloadSha256: hash })},${json({ signature_verified: true, manifest_valid: true, runtime_compatible: true })});
        INSERT INTO runtime_meta.release_activation_head VALUES('${id}','shared.text',1,'${hash}');
        INSERT INTO runtime_meta.applied_release_payload VALUES('${id}','entity_ui_component',NULL,'${hash}',${json(source)},${json({ plane_code: "studio", signed_document: { fixture: true } })});`);
      const session = `SET SESSION AUTHORIZATION component_client;BEGIN;SET LOCAL app.current_tenant_id='${tenant}';`;
      const install = `SELECT publication.install_active_ui_component('${id}');`;
      query(session + install + "ROLLBACK;");
      expect(
        query("SELECT count(*) FROM metadata.ui_component_contract;").trim(),
      ).toBe("0");
      query(session + install + "COMMIT;");
      query(session + install + "COMMIT;");
      expect(
        query("SELECT count(*) FROM metadata.ui_component_contract;").trim(),
      ).toBe("1");
      expect(() =>
        query(
          session +
            "INSERT INTO metadata.ui_component_contract DEFAULT VALUES;ROLLBACK;",
        ),
      ).toThrow();
      expect(() =>
        query(
          session +
            `SET LOCAL app.current_tenant_id='${randomUUID()}';` +
            install +
            "ROLLBACK;",
        ),
      ).toThrow();
      // Exercise the application reader independently of publication privileges.
      // Admission is a fixture here; actual transport is tested by product-command tests.
      const target = randomUUID();
      query(`CREATE SCHEMA entity_command_private;
        CREATE ROLE athyper_product_command_app NOLOGIN;CREATE ROLE native_component_client LOGIN;
        GRANT athyper_product_command_app TO native_component_client;
        GRANT USAGE ON SCHEMA entity_command_private TO athyper_product_command_app;
        CREATE FUNCTION entity_command_private.admitted(p_target uuid) RETURNS boolean LANGUAGE sql AS $$
          SELECT p_target::text=current_setting('fixture.admitted_target',true) $$;`);
      query(read("55_product_component_resource_read.sql"));
      const componentRead = `SELECT payload_hash FROM entity_command_private.read_component_resource('${target}','${source.declaration.id}','${hash}','${hash}',4194304);`;
      const appSession = `SET SESSION AUTHORIZATION native_component_client;BEGIN;SET LOCAL app.current_tenant_id='${tenant}';`;
      expect(() => query(appSession + componentRead + "ROLLBACK;")).toThrow();
      expect(
        query(
          appSession +
            `SET LOCAL fixture.admitted_target='${target}';` +
            componentRead +
            "ROLLBACK;",
        ),
      ).toContain(hash);
      expect(() =>
        query(
          appSession +
            `SET LOCAL fixture.admitted_target='${target}';` +
            componentRead.replace("4194304", "1") +
            "ROLLBACK;",
        ),
      ).toThrow();
      expect(() =>
        query(
          appSession +
            `SET LOCAL fixture.admitted_target='${randomUUID()}';` +
            componentRead +
            "ROLLBACK;",
        ),
      ).toThrow();
      expect(() =>
        query(
          appSession +
            `SET LOCAL fixture.admitted_target='${target}';SET LOCAL app.current_tenant_id='${randomUUID()}';` +
            componentRead +
            "ROLLBACK;",
        ),
      ).toThrow();
      for (const forbidden of [
        install,
        "SELECT * FROM publication.release;",
        "SELECT * FROM runtime_meta.applied_release;",
      ])
        expect(() => query(appSession + forbidden + "ROLLBACK;")).toThrow();
      for (const mutation of [
        `UPDATE publication.release SET approved_by=created_by`,
        `UPDATE runtime_meta.applied_release SET status='superseded'`,
        `UPDATE runtime_meta.release_activation_head SET artifact_hash='${"b".repeat(64)}'`,
        `UPDATE runtime_meta.applied_release_payload SET payload_json='{}'`,
      ])
        expect(() =>
          query(
            "BEGIN;" +
              mutation +
              `;SET LOCAL ROLE component_client;SET LOCAL app.current_tenant_id='${tenant}';` +
              install +
              "ROLLBACK;",
          ),
        ).toThrow();
      query(
        `UPDATE runtime_meta.applied_release_payload SET payload_hash='${"c".repeat(64)}';UPDATE runtime_meta.applied_release SET manifest=jsonb_set(manifest,'{payloadSha256}','"${"c".repeat(64)}"');`,
      );
      expect(() => query(session + install + "ROLLBACK;")).toThrow();
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
