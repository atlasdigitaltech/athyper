import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { nativeRootMember } from "./native-root-contract.js";
const enabled = process.env.ATHYPER_NATIVE_ROOT_POSTGRES === "1";
/** Canonical base root CREATE and domains plus generated additive target
 * DDL. The UUID default is a disposable stub. No host or writer qualification. */
it.skipIf(!enabled)(
  "preserves base root tuples and constraints while target writes stay blocked",
  async () => {
    const name = "athyper-native-root-" + randomUUID();
    let created = false;
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
    const query = (input: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
          "-At",
        ],
        { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();
    const read = (path: string) =>
      readFileSync(
        new URL(
          "../../../../db/ddl/planes/studio/metadata/" + path,
          import.meta.url,
        ),
        "utf8",
      );
    try {
      docker(
        "run",
        "-d",
        "--name",
        name,
        "--label",
        "athyper.purpose=native-root-ddl-test",
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
      query(
        "CREATE SCHEMA metadata;CREATE SCHEMA shared;CREATE FUNCTION shared.uuidv7() RETURNS uuid LANGUAGE sql AS 'SELECT gen_random_uuid()';",
      );
      query(read("02_domains.sql"));
      const base = read("03_tables.sql").match(
        /CREATE TABLE metadata\.entity_change_set \([\s\S]*?\n\);/,
      )?.[0];
      expect(base).toBeDefined();
      query(base!);
      const rowId = randomUUID(),
        entity = randomUUID(),
        draft = randomUUID(),
        actor = randomUUID();
      query(
        `INSERT INTO metadata.entity_change_set(id,entity_id,created_by,change_set_code,title) VALUES('${rowId}','${entity}','${actor}','test-draft','Test draft')`,
      );
      const before = query(
        "SELECT md5(to_jsonb(t)::text) FROM metadata.entity_change_set t",
      );
      query(read("29_native_root.generated.sql"));
      const additions = JSON.parse(
        readFileSync(
          new URL("./native-root.generated.json", import.meta.url),
          "utf8",
        ),
      ).columns as Record<string, { column: string; existing: boolean }>;
      const columns = Object.values(additions)
        .filter((c) => !c.existing)
        .map((c) => c.column);
      expect(columns).toHaveLength(10);
      const after = query(
        "SELECT md5((to_jsonb(t)-ARRAY[" +
          columns.map((c) => "'" + c + "'").join(",") +
          "]::text[])::text) FROM metadata.entity_change_set t",
      );
      expect(after).toBe(before);
      const samples: Record<string, string> = {
        nativeVersion: "2",
        sourceKind: "'product'",
        schemaVersion: "1",
        authoringSchemaHash: "'" + "a".repeat(64) + "'",
        entityLabelId: "'" + randomUUID() + "'::uuid",
        publicationResourceKey: "'metadata.entity.reference'",
        sourceUri: "'repository-source'",
        sourceHash: "'" + "a".repeat(64) + "'",
        publicationOwner: "'platform'",
        sourcePredecessorReleaseId: "'" + randomUUID() + "'::uuid",
      };
      for (const [property, sample] of Object.entries(samples)) {
        const column =
          nativeRootMember.columns[
            property as keyof typeof nativeRootMember.columns
          ].column;
        expect(() =>
          query(`UPDATE metadata.entity_change_set SET ${column}=${sample}`),
        ).toThrow(/entity_change_set_native_pending_ck/);
      }
      expect(() =>
        query("UPDATE metadata.entity_change_set SET lock_version=-1"),
      ).toThrow(/entity_change_set_lock_version_chk/);
      expect(query("SELECT count(*) FROM metadata.entity_change_set")).toBe(
        "1",
      );
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
