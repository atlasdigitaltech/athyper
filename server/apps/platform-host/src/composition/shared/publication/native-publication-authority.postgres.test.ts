import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { sha256 } from "@athyper/server-plane-studio-meta-entity-authoring";

// Disposable admission-contract proof. Synthetic identities/receipts never
// authorize DEV publication; enrollment and signing remain separate checks.
it.skipIf(process.env.NATIVE_PUBLICATION_POSTGRES !== "1")(
  "admits exact native review and typed targets without adoption; rejects drift",
  async () => {
    const name = "athyper-native-publication-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const query = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-XAt",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const id = (n: number) =>
      `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    const graph = {
      contractSchema: "athyper.meta-entity-contract/2.5",
      authoringSource: {
        entityId: id(4),
        tenantId: null,
        sourceKind: "product",
      },
      ownedLabels: { changeSetId: id(5) },
      referenceMembers: { members: { target: [{ targetPlane: "studio" }] } },
    };
    const hash = sha256(graph);
    const policy = {
      schema: "athyper.dev-human-reviewed-publication/1",
      authorityTenantId: id(3),
      authorPrincipalId: id(7),
      publisherPrincipalId: id(6),
      plan: {
        schema: "athyper.human-reviewed-publication-plan/1",
        publisherId: id(6),
        members: [
          {
            entityId: id(4),
            changeSetId: id(5),
            revision: 3,
            authorId: id(1),
            reviewerId: id(2),
            sourceReleaseId: null,
            contractHash: hash,
            descriptorHash: "d".repeat(64),
            targets: [
              {
                plane: "studio",
                contractHash: hash,
                descriptorHash: "d".repeat(64),
              },
            ],
          },
        ],
      },
    };
    const literal = (x: unknown) =>
      "'" + JSON.stringify(x).replaceAll("'", "''") + "'::jsonb";
    const call = (change = "", phase = "release", value = policy) =>
      query(`BEGIN; SET LOCAL app.tenant='${id(3)}'; SET LOCAL app.actor='${id(6)}'; ${change}
      SELECT publication.fn_human_reviewed_entity_policy(${literal(value)},'${id(5)}','${phase}')->>'productHash'; ROLLBACK;`);
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
          break;
        } catch {
          if (n === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      query(`CREATE SCHEMA publication; CREATE SCHEMA metadata; CREATE SCHEMA snapshot; CREATE SCHEMA master; CREATE SCHEMA shared;
        CREATE FUNCTION shared.current_tenant_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.tenant')::uuid $$;
        CREATE FUNCTION master.current_principal_id_soft() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('app.actor')::uuid $$;
        CREATE TABLE metadata.entity_change_set(id uuid,entity_id uuid,tenant_id uuid,source_kind text,native_core_layout_version int,status text,lock_version bigint,created_by uuid,submitted_by uuid,approved_by uuid,base_release_id uuid);
        CREATE TABLE metadata.entity_target(change_set_id uuid,entity_id uuid,tenant_id uuid,target_plane text);
        CREATE TABLE metadata.entity_product_review_receipt(authority_tenant_id uuid,change_set_id uuid,actor_id uuid,action text,expected_revision bigint,contract_hash text);
        CREATE TABLE snapshot.entity_draft_save(change_set_id uuid,tenant_id uuid,lock_version bigint,graph jsonb);
        CREATE TABLE master.principal(id uuid,tenant_id uuid,principal_type text,status text);
        CREATE TABLE master.principal_identity_binding(principal_id uuid,tenant_id uuid,status text,service_client_id uuid,realm_key text,audience text);
        INSERT INTO master.principal VALUES('${id(1)}','${id(3)}','user','active'),('${id(2)}','${id(3)}','user','active');
        INSERT INTO master.principal_identity_binding SELECT id,tenant_id,'active',NULL,'platform-control','athyper-platform-control-api' FROM master.principal;
        INSERT INTO metadata.entity_change_set VALUES('${id(5)}','${id(4)}',NULL,'product',2,'approved',3,'${id(1)}','${id(1)}','${id(2)}',NULL);
        INSERT INTO metadata.entity_target VALUES('${id(5)}','${id(4)}',NULL,'studio');
        INSERT INTO metadata.entity_product_review_receipt VALUES('${id(3)}','${id(5)}','${id(1)}','submit',1,'${hash}'),('${id(3)}','${id(5)}','${id(2)}','approve',2,'${hash}');
        INSERT INTO snapshot.entity_draft_save VALUES('${id(5)}',NULL,3,${literal(graph)});`);
      const canonical = readFileSync(
        new URL(
          "../../../../../../db/ddl/planes/studio/metadata/14_runtime_restoration.sql",
          import.meta.url,
        ),
        "utf8",
      );
      query(
        canonical.slice(
          canonical.indexOf(
            "CREATE OR REPLACE FUNCTION publication.fn_successor_canonical_json",
          ),
          canonical.indexOf(
            "REVOKE ALL ON FUNCTION publication.fn_successor_canonical_json",
          ),
        ),
      );
      const ddl = readFileSync(
        new URL(
          "../../../../../../db/ddl/planes/studio/publication/36_native_publication_authority.sql",
          import.meta.url,
        ),
        "utf8",
      );
      query(
        ddl.split(
          "CREATE OR REPLACE FUNCTION publication.fn_system_entity_authority",
        )[0]!,
      );
      expect(call()).toContain(hash);
      for (const change of [
        "DELETE FROM metadata.entity_product_review_receipt WHERE action='submit';",
        "DELETE FROM metadata.entity_product_review_receipt WHERE action='approve';",
        "UPDATE metadata.entity_product_review_receipt SET action='adopt' WHERE action='submit';",
        "UPDATE metadata.entity_change_set SET native_core_layout_version=1;",
        "UPDATE metadata.entity_change_set SET approved_by=created_by;",
        "UPDATE metadata.entity_target SET target_plane='mesh';",
        "UPDATE snapshot.entity_draft_save SET lock_version=2;",
        "UPDATE snapshot.entity_draft_save SET graph=graph||'{\"unreviewed\":true}'::jsonb;",
        "UPDATE master.principal SET status='disabled';",
        `SET LOCAL app.actor='${id(1)}';`,
        `SET LOCAL app.tenant='${id(8)}';`,
      ])
        expect(() => call(change)).toThrow();
      const changed = structuredClone(policy);
      changed.plan.members[0]!.contractHash = "0".repeat(64);
      expect(() => call("", "release", changed)).toThrow();
      expect(
        call(
          "UPDATE metadata.entity_change_set SET status='published',lock_version=4; UPDATE snapshot.entity_draft_save SET lock_version=4;",
          "prepare",
        ),
      ).toContain(hash);
      expect(
        query(
          "SELECT count(*) FROM metadata.entity_product_review_receipt",
        ).trim(),
      ).toBe("2");
    } finally {
      try {
        docker("rm", "-f", name);
      } catch {}
    }
  },
  60000,
);
