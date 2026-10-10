import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";

// Real restricted login, forced RLS and the shipped routine. No DEV credentials.
it.skipIf(process.env.ATHYPER_ROOT_REGISTRATION_POSTGRES !== "1")(
  "qualifies fresh and upgraded root registration without UPDATE grants",
  async () => {
    const name = "athyper-root-registration-" + randomUUID();
    const docker = (...args: string[]) =>
      execFileSync("docker", args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    const q = (source: string) =>
      execFileSync(
        "docker",
        [
          "exec",
          "-i",
          name,
          "psql",
          "-X",
          "-At",
          "-U",
          "postgres",
          "-v",
          "ON_ERROR_STOP=1",
        ],
        { input: source, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      );
    const read = (file: string) =>
      readFileSync(
        new URL("../../../../../db/" + file, import.meta.url),
        "utf8",
      );
    const canonical = read(
      "ddl/planes/studio/metadata/67_native_root_registration.sql",
    );
    const historical = read(
      "scripts/operations/upgrades/entity-product-command/20261010_entity_native_root_registration.sql",
    );
    const upgrade = read(
      "migrations/20261010_entity_native_root_registration_locking.sql",
    );
    let started = false;
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
      started = true;
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
          break;
        } catch {
          if (i === 99) throw Error("POSTGRES_NOT_READY");
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      for (const installation of ["fresh", "upgrade", "forward-install"]) {
        q(`CREATE SCHEMA metadata; CREATE SCHEMA control;
          CREATE ROLE athyper_product_command_owner NOLOGIN;
          CREATE ROLE athyper_product_command_issuer NOLOGIN;
          CREATE ROLE athyper_product_command_app NOLOGIN;
          CREATE ROLE root_client LOGIN;
          GRANT athyper_product_command_app TO root_client;
          CREATE SCHEMA entity_command_private AUTHORIZATION athyper_product_command_owner;
          GRANT USAGE ON SCHEMA entity_command_private TO athyper_product_command_app;
          CREATE DOMAIN metadata.entity_class_d AS text;
          CREATE DOMAIN metadata.entity_ownership_d AS text;
          CREATE TABLE control.module(id uuid PRIMARY KEY, code text UNIQUE, status text);
          CREATE TABLE metadata.entity(id uuid PRIMARY KEY,tenant_id uuid,module_id uuid REFERENCES control.module(id),entity_code text UNIQUE,entity_class metadata.entity_class_d,ownership_model metadata.entity_ownership_d,status text,created_by uuid);
          ALTER TABLE metadata.entity ENABLE ROW LEVEL SECURITY; ALTER TABLE metadata.entity FORCE ROW LEVEL SECURITY;
          SET ROLE athyper_product_command_owner;
          CREATE TABLE entity_command_private.admission(token_hash bytea,revoked boolean);
          RESET ROLE;`);
        if (installation !== "forward-install")
          q(installation === "fresh" ? canonical : historical);
        if (installation !== "fresh") q(upgrade);
        const entity = randomUUID(),
          module = randomUUID(),
          actor = randomUUID(),
          tenant = randomUUID(),
          draft = randomUUID();
        q(
          `INSERT INTO control.module VALUES('${module}','fixture_module','active');`,
        );
        let serial = 0;
        const ticket = (extra = "", id = entity, code = "fixture_entity") => {
          const token = (++serial).toString(16).padStart(64, "0");
          q(`INSERT INTO entity_command_private.root_registration_admission(token_hash,login_role,authority_tenant_id,actor_id,change_set_id,request_hash,entity_id,module_code,entity_code,entity_class,ownership_model,expires_at)
          VALUES(sha256(convert_to('${token}','UTF8')),'root_client','${tenant}','${actor}','${draft}',repeat('b',64),'${id}','fixture_module','${code}','reference','system',clock_timestamp()+interval '60 seconds'); ${extra.replaceAll("TOKEN", token)}`);
          return token;
        };
        const context = `SET SESSION AUTHORIZATION root_client; BEGIN; SELECT set_config('app.current_principal_id','${actor}',true),set_config('app.current_tenant_id','${tenant}',true);`;
        const invoke = (token: string, tail = "COMMIT;") =>
          q(
            context +
              `SELECT entity_command_private.enter_root_registration('${token}',repeat('b',64));` +
              tail,
          );
        const reject = (source: string, message: string) => {
          try {
            q(source);
            throw Error("EXPECTED_REJECTION");
          } catch (e) {
            expect(String((e as { stderr?: unknown }).stderr ?? e)).toContain(
              message,
            );
          }
        };
        const firstToken = ticket();
        expect(invoke(firstToken)).toContain("\nt\n");
        reject(
          context +
            `SELECT entity_command_private.enter_root_registration('${firstToken}',repeat('b',64));COMMIT;`,
          "PRODUCT_COMMAND_ADMISSION_DENIED",
        );
        expect(invoke(ticket())).toContain("\nf\n");
        expect(
          q(
            `SELECT entity_code||':'||module_id||':'||entity_class||':'||ownership_model||':'||status||':'||created_by FROM metadata.entity WHERE id='${entity}';`,
          ).trim(),
        ).toBe(`fixture_entity:${module}:reference:system:draft:${actor}`);
        reject(
          context +
            `SELECT entity_command_private.enter_root_registration('${ticket("", entity, "conflict")}',repeat('b',64));COMMIT;`,
          "NATIVE_ROOT_REGISTRATION_CONFLICT",
        );
        for (const condition of [
          "revoked=true",
          "expires_at=clock_timestamp()-interval '1 second'",
          "actor_id=gen_random_uuid()",
          "authority_tenant_id=gen_random_uuid()",
          "login_role='another_login'",
        ]) {
          const t = ticket(
            `UPDATE entity_command_private.root_registration_admission SET ${condition} WHERE token_hash=sha256(convert_to('TOKEN','UTF8'));`,
          );
          reject(
            context +
              `SELECT entity_command_private.enter_root_registration('${t}',repeat('b',64));COMMIT;`,
            "PRODUCT_COMMAND_ADMISSION_DENIED",
          );
        }
        const wrongHash = ticket();
        reject(
          context +
            `SELECT entity_command_private.enter_root_registration('${wrongHash}',repeat('c',64));COMMIT;`,
          "PRODUCT_COMMAND_ADMISSION_DENIED",
        );
        const rollbackId = randomUUID(),
          rollback = ticket("", rollbackId, "rollback_entity");
        expect(invoke(rollback, "ROLLBACK;")).toContain("\nt\n");
        expect(
          q(
            `SELECT count(*) FROM metadata.entity WHERE id='${rollbackId}';`,
          ).trim(),
        ).toBe("0");
        // Concurrent first registrations serialize; only one inserts the root.
        const concurrentId = randomUUID();
        const concurrentTokens = [
          ticket("", concurrentId, "concurrent_entity"),
          ticket("", concurrentId, "concurrent_entity"),
        ];
        const outcomes = await Promise.all(
          concurrentTokens.map(
            (token) =>
              new Promise<string>((resolve, reject) => {
                const child = spawn("docker", [
                  "exec",
                  "-i",
                  name,
                  "psql",
                  "-X",
                  "-At",
                  "-U",
                  "postgres",
                  "-v",
                  "ON_ERROR_STOP=1",
                ]);
                let out = "",
                  err = "";
                child.stdout.on("data", (data) => {
                  out += data;
                });
                child.stderr.on("data", (data) => {
                  err += data;
                });
                child.on("error", reject);
                child.on("close", (code) =>
                  code === 0 ? resolve(out) : reject(new Error(err)),
                );
                child.stdin.end(
                  context +
                    `SELECT entity_command_private.enter_root_registration('${token}',repeat('b',64)); SELECT pg_sleep(0.1); COMMIT;`,
                );
              }),
          ),
        );
        expect(outcomes.filter((out) => out.includes("\nt\n"))).toHaveLength(1);
        expect(outcomes.filter((out) => out.includes("\nf\n"))).toHaveLength(1);
        // A future routine under the same owner still cannot escape the ticket.
        q(`SET ROLE athyper_product_command_owner;
          CREATE FUNCTION entity_command_private.fixture_owner_probe(p_id uuid,p_module uuid) RETURNS bigint
          LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
          BEGIN
            IF p_id IS NOT NULL THEN
              INSERT INTO metadata.entity(id,module_id,entity_code,entity_class,ownership_model,status,created_by)
              VALUES(p_id,p_module,'unadmitted_root','reference','system','draft',current_setting('app.current_principal_id')::uuid);
            END IF;
            RETURN (SELECT count(*) FROM metadata.entity);
          END $$;
          REVOKE ALL ON FUNCTION entity_command_private.fixture_owner_probe(uuid,uuid) FROM PUBLIC;
          GRANT EXECUTE ON FUNCTION entity_command_private.fixture_owner_probe(uuid,uuid) TO athyper_product_command_app;
          RESET ROLE;`);
        expect(
          invoke(
            ticket(),
            "SELECT 'visible='||entity_command_private.fixture_owner_probe(NULL,NULL); COMMIT;",
          ),
        ).toContain("visible=1");
        reject(
          context +
            `SELECT entity_command_private.enter_root_registration('${ticket()}',repeat('b',64)); SELECT entity_command_private.fixture_owner_probe('${randomUUID()}','${module}'); COMMIT;`,
          "row-level security policy",
        );
        // No unrestricted direct read/insert or UPDATE privilege for the client.
        reject(context + "SELECT * FROM metadata.entity;", "permission denied");
        reject(
          context +
            `INSERT INTO metadata.entity(id) VALUES('${randomUUID()}');`,
          "permission denied",
        );
        expect(
          q(
            "SELECT has_table_privilege('athyper_product_command_owner','metadata.entity','UPDATE'),has_table_privilege('athyper_product_command_owner','control.module','UPDATE');",
          ).trim(),
        ).toBe("f|f");
        // Owner read policy cannot see roots without an active matching ticket.
        expect(
          q(
            "SET ROLE athyper_product_command_owner; SELECT count(*) FROM metadata.entity;",
          ),
        ).toContain("\n0\n");
        q(
          "DROP SCHEMA metadata,control,entity_command_private CASCADE; DROP OWNED BY root_client,athyper_product_command_app,athyper_product_command_issuer,athyper_product_command_owner; DROP ROLE root_client,athyper_product_command_app,athyper_product_command_issuer,athyper_product_command_owner;",
        );
      }
    } finally {
      if (started) docker("rm", "-f", name);
    }
  },
  120000,
);
