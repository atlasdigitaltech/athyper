import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { nativeOperationMember } from "./native-operation-contract.js";
const enabled = process.env.ATHYPER_NATIVE_OPERATION_POSTGRES === "1";
/** Canonical base operation CREATE and domains plus generated additive target
 * DDL. The UUID default is a disposable stub. No host or writer qualification. */
it.skipIf(!enabled)(
  "preserves base operation tuples and constraints while target writes stay blocked",
  async () => {
    const name = "athyper-native-operation-" + randomUUID();
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
        "athyper.purpose=native-operation-ddl-test",
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
        /CREATE TABLE metadata\.entity_operation \([\s\S]*?\n\);/,
      )?.[0];
      expect(base).toBeDefined();
      query(base!);
      const rowId = randomUUID(),
        entity = randomUUID(),
        draft = randomUUID(),
        actor = randomUUID();
      query(
        `INSERT INTO metadata.entity_operation(id,entity_id,change_set_id,created_by,operation_key,operation_kind,label,audit_event_code) VALUES('${rowId}','${entity}','${draft}','${actor}','inspect','read','Inspect','test.inspect')`,
      );
      const before = query(
        "SELECT md5(to_jsonb(t)::text) FROM metadata.entity_operation t",
      );
      query(read("28_native_operation.generated.sql"));
      const additions = JSON.parse(
        readFileSync(
          new URL("./native-operation.generated.json", import.meta.url),
          "utf8",
        ),
      ).columns as Record<
        string,
        { column: string; baseDeclaration: string | null }
      >;
      const columns = Object.values(additions)
        .filter((c) => c.baseDeclaration === null)
        .map((c) => c.column);
      expect(columns).toHaveLength(14);
      const after = query(
        "SELECT md5((to_jsonb(t)-ARRAY[" +
          columns.map((c) => "'" + c + "'").join(",") +
          "]::text[])::text) FROM metadata.entity_operation t",
      );
      expect(after).toBe(before);
      const samples: Record<string, string> = {
        labelId: "'" + randomUUID() + "'::uuid",
        inputSurfaceId: "'" + randomUUID() + "'::uuid",
        resultSurfaceId: "'" + randomUUID() + "'::uuid",
        authorizationTarget: "'existing'",
        authorizationEffect: "'read'",
        requiresParentRead: "false",
        requiresPreflight: "false",
        replacementOperationId: "'" + randomUUID() + "'::uuid",
        handlerVersion: "1",
        preflightKey: "'test.preflight.v1'",
        preflightVersion: "1",
        extensionFieldMode: "'none'",
        exportFormats: "ARRAY['csv']",
        exportMaxRecords: "1",
      };
      for (const [property, sample] of Object.entries(samples)) {
        const column =
          nativeOperationMember.columns[
            property as keyof typeof nativeOperationMember.columns
          ].column;
        expect(() =>
          query(`UPDATE metadata.entity_operation SET ${column}=${sample}`),
        ).toThrow(/entity_operation_native_pending_ck/);
      }
      expect(() =>
        query("UPDATE metadata.entity_operation SET operation_kind='execute'"),
      ).toThrow(/entity_operation_handler_required_chk/);
      expect(query("SELECT count(*) FROM metadata.entity_operation")).toBe("1");
    } finally {
      if (created) docker("rm", "-f", name);
    }
  },
  60000,
);
