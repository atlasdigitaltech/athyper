#!/usr/bin/env node
/** DEVFULL only. Credentials never enter argv, logs, browser sessions or the repo. */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const directory = join(
  homedir(),
  ".athyper/instances/dev/secrets/dev-publication",
);
const configPath = join(directory, "server.json");
const credentialPath = join(directory, "client.json");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
function docker(args, input) {
  const result = spawnSync("docker", args, {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0 || result.error)
    throw Error(
      "DEV publication Docker operation failed; no credentials were logged",
    );
  return result.stdout.trim();
}
function privateRead(path) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.mode & 0o077 || stat.uid !== process.getuid())
    throw Error(`Private, owner-only file required: ${path}`);
  return JSON.parse(readFileSync(path, "utf8"));
}
function assertDevContainer(name, project) {
  if (
    docker([
      "inspect",
      "--format",
      '{{index .Config.Labels "com.docker.compose.project"}}',
      name,
    ]) !== project
  )
    throw Error("Refusing a non-DEV container");
}

export function parsePublishArguments(args) {
  const result = { setup: false, dryRun: false, url: undefined, overlay: "intake-presentation", tenant: "cirrusatlantic" };
  let tenantSpecified = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") continue;
    if (arg === "--tenant") {
      if (tenantSpecified) throw Error("Only one tenant may be specified");
      tenantSpecified = true;
      result.tenant = args[++i];
      if (!["cirrusatlantic", "athyper"].includes(result.tenant))
        throw Error("Unsupported DEV publication tenant");
    }
    else if (arg === "--setup") result.setup = true;
    else if (arg === "--dry-run") result.dryRun = true;
    else if (arg === "--intake-prerequisite") result.overlay = "intake-prerequisite";
    else if (arg === "--url") {
      const url = new URL(args[++i]);
      // Local turbo host only. Container mode uses authenticated loopback via docker exec.
      if (
        url.protocol !== "http:" ||
        !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw Error("Only a loopback API URL is supported");
      result.url = url.origin;
    } else throw Error(`Unknown option: ${arg}`);
  }
  if (result.setup && (result.dryRun || result.url || result.overlay !== "intake-presentation"))
    throw Error("Setup cannot be combined with publication options");
  if (tenantSpecified && !result.setup)
    throw Error("Tenant selection currently supports isolated setup only; activation needs a reviewed tenant candidate");
  return result;
}

function setup(tenant = "cirrusatlantic") {
  const tenantId = {cirrusatlantic: "44444444-4444-4444-8444-444444444444", athyper: "11111111-1111-4111-8111-111111111111"}[tenant];
  if (!tenantId) throw Error("Unsupported DEV publication tenant");
  // Keep the mounted CATL configuration untouched. No wildcard tenant authority.
  const directory = join(homedir(), ".athyper/instances/dev/secrets", tenant === "cirrusatlantic" ? "dev-publication" : `dev-publication-${tenant}`);
  const configPath = join(directory, "server.json");
  const credentialPath = join(directory, "client.json");
  assertDevContainer("athyper-dev-db-1", "athyper-dev");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (statSync(directory).mode & 0o077)
    throw Error("DEV publication directory must be private");
  let config, credentials;
  if (existsSync(configPath) || existsSync(credentialPath)) {
    config = privateRead(configPath);
    credentials = privateRead(credentialPath);
    if (
      config.instance !== "dev" ||
      config.entityCode !== "business_partner" ||
      config.tenantCode !== tenant ||
      config.tenantId !== tenantId ||
      config.author.principalId === config.publisher.principalId ||
      config.targets.join() !== "neon" ||
      ["author", "publisher"].some(
        (role) => config[role].digest !== digest(credentials[role]),
      )
    )
      throw Error(
        "Existing configuration differs; refusing to rotate or overwrite it",
      );
  } else {
    credentials = {
      author: randomBytes(32).toString("base64url"),
      publisher: randomBytes(32).toString("base64url"),
    };
    config = {
      schemaVersion: 1,
      instance: "dev",
      tenantId,
      tenantCode: tenant,
      entityCode: "business_partner",
      targets: ["neon"],
      ...Object.fromEntries(
        ["author", "publisher"].map((role) => [
          role,
          {
            principalId: randomUUID(),
            code: `dev.metadata.${role}`,
            authEpoch: 0,
            digest: digest(credentials[role]),
          },
        ]),
      ),
    };
    // Persist first so a partial provisioning failure can be retried with the same identities.
    writeFileSync(credentialPath, JSON.stringify(credentials, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  }
  // Bootstrap only machine principals; never grant humans, change metadata or write a release.
  // Existing principal rows are verified, never silently adopted or reactivated.
  for (const plane of ["studio", ...config.targets]) {
    const statements = ["BEGIN;"];
    for (const role of ["author", "publisher"]) {
      const c = config[role];
      statements.push(`DO $provision$ BEGIN
        IF NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=${literal(config.tenantId)}::uuid AND code=${literal(config.tenantCode)}) THEN
          RAISE EXCEPTION 'DEV tenant mismatch'; END IF;
        INSERT INTO master.principal(id,tenant_id,code,name,principal_type,provisioning_source,metadata,created_by)
        VALUES(${literal(c.principalId)}::uuid,${literal(config.tenantId)}::uuid,${literal(c.code)},${literal(`DEV metadata ${role}`)},
          'service_account','internal',${literal(JSON.stringify({ devPublication: { role, instance: "dev" } }))}::jsonb,${literal(c.principalId)}::uuid)
        ON CONFLICT (tenant_id,code) DO NOTHING;
        IF NOT EXISTS(SELECT 1 FROM master.principal WHERE tenant_id=${literal(config.tenantId)}::uuid AND code=${literal(c.code)}
          AND id=${literal(c.principalId)}::uuid AND principal_type='service_account' AND provisioning_source='internal'
          AND status='active' AND auth_epoch=${Number(c.authEpoch)} AND metadata->'devPublication'=${literal(JSON.stringify({ role, instance: "dev" }))}::jsonb)
          THEN RAISE EXCEPTION 'Existing workload identity conflicts or is revoked'; END IF;
      END $provision$;`);
    }
    statements.push("COMMIT;");
    docker(
      [
        "exec",
        "-i",
        "athyper-dev-db-1",
        "psql",
        "-U",
        "postgres",
        "-d",
        `athyper_${plane}`,
        "-X",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      statements.join("\n"),
    );
  }
  console.log(
    `DEV author/publisher configured for ${config.tenantCode}/${config.entityCode} → ${config.targets.join(", ")}.`,
  );
  console.log(
    `Restart DEVFULL to mount ${configPath}. For a local turbo API set ATHYPER_DEV_PUBLICATION_CONFIG to this path and ATHYPER_DEV_PRESET=devfull (with the normal DEV host environment).`,
  );
}

async function publish(options) {
  const config = privateRead(configPath),
    credentials = privateRead(credentialPath);
  if (
    config.instance !== "dev" ||
    config.author.digest !== digest(credentials.author) ||
    config.publisher.digest !== digest(credentials.publisher)
  )
    throw Error("DEV credentials do not match configuration");
  const body = {
    entityCode: config.entityCode,
    scope: { kind: "tenant", tenantId: config.tenantId },
    targets: config.targets,
    overlay: options.overlay,
    dryRun: options.dryRun,
  };
  const headers = {
    "content-type": "application/json",
    authorization: `Bearer ${credentials.author}`,
    "x-dev-publisher-credential": credentials.publisher,
  };
  let result;
  if (options.url) {
    const response = await fetch(`${options.url}/api/dev-publication/publish`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(120000),
    });
    result = { status: response.status, body: await response.json() };
  } else {
    const name = "athyper-dev-source-api-1";
    assertDevContainer(name, "athyper-dev-source");
    const script = `let data=''; for await (const c of process.stdin) data+=c;
      const {headers,body}=JSON.parse(data);
      const response=await fetch('http://127.0.0.1:4000/api/dev-publication/publish',
        {method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(120000)});
      console.log(JSON.stringify({status:response.status,body:await response.json()}));`;
    result = JSON.parse(
      docker(
        ["exec", "-i", name, "node", "--input-type=module", "-e", script],
        JSON.stringify({ headers, body }),
      ),
    );
  }
  console.log(JSON.stringify(result.body, null, 2));
  if (result.status >= 400) process.exitCode = 1;
  if (result.body.status === "dispatched")
    console.log(
      "Signed release dispatched. Activation is asynchronous; verify its receipt in Studio before claiming deployment success.",
    );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const options = parsePublishArguments(process.argv.slice(2));
    if (options.setup) setup(options.tenant);
    else await publish(options);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
