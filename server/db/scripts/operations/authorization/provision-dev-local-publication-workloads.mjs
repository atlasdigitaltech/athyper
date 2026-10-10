#!/usr/bin/env node
/**
 * Install the two local-only machine identities used by the approved standing
 * Entity-publication authority, then generate their private workload files.
 * This is deliberately separate from policy enrollment: it creates no policy,
 * grant, release, graph, or activation.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const container = "athyper-dev-db-1";
const database = "athyper_studio";
const confirmation = "DEV-LOCAL-PUBLICATION-WORKLOADS";
const sourceRef = "dev:local-publication-workloads:v1";
const tenantId = "11111111-1111-4111-8111-111111111111";
const expectedRoot = resolve(homedir(), ".athyper/instances/dev/secrets");
const roles = ["author", "publisher"];

const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function parseArguments(args) {
  const value = {};
  for (const argument of args) {
    const match = /^--([^=]+)=(.+)$/.exec(argument);
    if (!match || !["apply", "output"].includes(match[1]) || value[match[1]])
      throw Error("DEV_LOCAL_WORKLOAD_ARGUMENT_INVALID");
    value[match[1]] = match[2];
  }
  if (value.apply !== confirmation || !value.output)
    throw Error("Use --apply=" + confirmation + " --output=<new private directory>");
  const output = resolve(value.output);
  if (
    output === expectedRoot ||
    !output.startsWith(expectedRoot + "/") ||
    output.split("/").some((part) => part === "..")
  )
    throw Error("DEV_LOCAL_WORKLOAD_OUTPUT_INVALID");
  return { output };
}

export function provisioningSql(commit) {
  assert.equal(typeof commit, "boolean");
  return `BEGIN;
SET LOCAL app.database_plane='studio';
SET LOCAL app.current_plane_key='studio';
DO $workloads$
DECLARE tenant uuid:=${literal(tenantId)}::uuid; actor uuid; existing record; role_name text;
BEGIN
 IF current_database()<>${literal(database)} THEN RAISE EXCEPTION 'DEV_LOCAL_WORKLOAD_DATABASE_INVALID'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(${literal(sourceRef)},0));
 SELECT id INTO STRICT actor FROM master.principal
   WHERE tenant_id=tenant AND code='seed.three-plane-provisioner'
     AND principal_type='service_account' AND provisioning_source='internal' AND status='active';
 PERFORM set_config('app.current_tenant_id',tenant::text,true);
 PERFORM set_config('app.current_principal_id',actor::text,true);
 FOREACH role_name IN ARRAY ARRAY['author','publisher'] LOOP
   SELECT id,principal_type,provisioning_source,status,metadata INTO existing
     FROM master.principal WHERE tenant_id=tenant AND code='dev.metadata.'||role_name FOR UPDATE;
   IF FOUND AND (existing.principal_type<>'service_account' OR existing.provisioning_source<>'internal'
       OR existing.status<>'active' OR existing.metadata IS DISTINCT FROM
         jsonb_build_object('managedBy',${literal(sourceRef)},'environment','dev','role',role_name)) THEN
     RAISE EXCEPTION 'DEV_LOCAL_WORKLOAD_CONFLICT:%',role_name;
   END IF;
   IF NOT FOUND THEN
     INSERT INTO master.principal(tenant_id,code,name,principal_type,provisioning_source,metadata,status,created_by)
     VALUES(tenant,'dev.metadata.'||role_name,'DEV metadata '||initcap(role_name),'service_account','internal',
       jsonb_build_object('managedBy',${literal(sourceRef)},'environment','dev','role',role_name),'active',actor);
   END IF;
 END LOOP;
 IF (SELECT count(*) FROM master.principal WHERE tenant_id=tenant
   AND code IN ('dev.metadata.author','dev.metadata.publisher') AND principal_type='service_account'
   AND provisioning_source='internal' AND status='active'
   AND metadata->>'managedBy'=${literal(sourceRef)})<>2 THEN
   RAISE EXCEPTION 'DEV_LOCAL_WORKLOAD_READBACK_FAILED';
 END IF;
END $workloads$;
SELECT json_build_object('author',(SELECT id FROM master.principal WHERE tenant_id=${literal(tenantId)}::uuid AND code='dev.metadata.author'),
 'publisher',(SELECT id FROM master.principal WHERE tenant_id=${literal(tenantId)}::uuid AND code='dev.metadata.publisher'));
${commit ? "COMMIT" : "ROLLBACK"};`;
}

function run(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .at(-1);
}

function credentials() {
  return randomBytes(32).toString("base64url");
}

export function workloadFiles(principals, values) {
  if (!principals?.author || !principals?.publisher || principals.author === principals.publisher)
    throw Error("DEV_LOCAL_WORKLOAD_PRINCIPALS_INVALID");
  if (!roles.every((role) => /^[A-Za-z0-9_-]{43}$/.test(values[role] ?? "")))
    throw Error("DEV_LOCAL_WORKLOAD_CREDENTIAL_INVALID");
  const identity = (role) => ({
    principalId: principals[role],
    code: `dev.metadata.${role}`,
    authEpoch: 0,
    credentialSha256: sha256(values[role]),
  });
  return {
    workload: {
      schemaVersion: 1,
      instance: "dev",
      tenantId,
      realmKey: "platform-control",
      author: identity("author"),
      publisher: identity("publisher"),
    },
    client: { author: values.author, publisher: values.publisher },
  };
}

export function main(args = process.argv.slice(2)) {
  const { output } = parseArguments(args);
  const inspection = JSON.parse(
    execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
  )[0];
  if (
    inspection.Config?.Labels?.["com.docker.compose.project"] !== "athyper-dev" ||
    inspection.State?.Running !== true
  )
    throw Error("DEV_LOCAL_WORKLOAD_TARGET_INVALID");
  const result = JSON.parse(run(provisioningSql(true)));
  const values = { author: credentials(), publisher: credentials() };
  const files = workloadFiles(result, values);
  mkdirSync(output, { mode: 0o700 });
  writeFileSync(resolve(output, "workload.json"), JSON.stringify(files.workload, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  writeFileSync(resolve(output, "client.json"), JSON.stringify(files.client, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  writeFileSync(
    resolve(output, "installation.json"),
    JSON.stringify(
      {
        schema: "entity.local-publication-workload-installation/1",
        database,
        sourceRef,
        installedAt: new Date().toISOString(),
        principals: result,
        workload: {
          authorCredentialSha256: files.workload.author.credentialSha256,
          publisherCredentialSha256: files.workload.publisher.credentialSha256,
        },
        policyEnrollment: false,
        publication: false,
        activation: false,
      },
      null,
      2,
    ) + "\n",
    { mode: 0o600, flag: "wx" },
  );
  process.stdout.write(JSON.stringify({ output, principals: result, installed: true }) + "\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]).href))
  try {
    main();
  } catch (error) {
    process.stderr.write((error?.stderr?.toString() || error?.message || String(error)) + "\n");
    process.exitCode = 1;
  }
