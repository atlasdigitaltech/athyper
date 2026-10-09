import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  statSync,
  writeFileSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Kysely, PostgresDialect } from "kysely";
import { parsePublicationWorkloadConfiguration } from "../../src/composition/shared/publication/workload-configuration.js";
import { installLocalPublicationConfiguration } from "../../src/composition/shared/publication/local-publication-installation.js";

// Installs a pin to a reviewed ACTIVE policy. This command never proposes,
// activates or edits policy/IAM rows, and never prints workload credentials.
const args = process.argv.slice(2);
assert.equal(
  args.length,
  5,
  "--config=PATH --policy-id=UUID --version=N --hash=SHA256 --confirm=DEV-LOCAL-PUBLICATION-INSTALL",
);
const values = Object.fromEntries(
  args.map((arg) => {
    const i = arg.indexOf("=");
    assert.ok(i > 2);
    return [arg.slice(2, i), arg.slice(i + 1)];
  }),
);
assert.deepEqual(Object.keys(values).sort(), [
  "config",
  "confirm",
  "hash",
  "policy-id",
  "version",
]);
assert.equal(values.confirm, "DEV-LOCAL-PUBLICATION-INSTALL");
const configPath = resolve(values.config!);
assert.ok(configPath.includes("/.athyper/instances/dev/secrets/"));
const file = statSync(configPath);
assert.ok(
  file.isFile() && file.size < 16384 && !(file.mode & 0o077),
  "private workload configuration required",
);
const raw = JSON.parse(readFileSync(configPath, "utf8"));
raw.localAuthority = {
  id: values["policy-id"],
  version: Number(values.version),
  hash: values.hash,
};
const config = parsePublicationWorkloadConfiguration(
  raw,
  {
    ATHYPER_ENV: "local",
    ATHYPER_DEV_PRESET: "devfull",
    ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
    PLATFORM_AUTHORITY_TENANT_ID: raw.tenantId,
  },
  "local",
);
const container = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-dev-db-1"], { encoding: "utf8" }),
)[0];
assert.equal(
  container.Config.Labels["com.docker.compose.project"],
  "athyper-dev",
);
assert.equal(container.State.Running, true);
const env = Object.fromEntries(
  container.Config.Env.map((value: string) => {
    const i = value.indexOf("=");
    return [value.slice(0, i), value.slice(i + 1)];
  }),
);
const secret = container.Mounts.find(
  (mount: any) => mount.Destination === env.POSTGRES_PASSWORD_FILE,
)?.Source;
assert.ok(secret?.includes("/.athyper/instances/dev/secrets/"));
const { Pool } = createRequire(new URL("../../package.json", import.meta.url))(
  "pg",
);
const database = new Kysely<Record<string, never>>({
  dialect: new PostgresDialect({
    pool: new Pool({
      host: (Object.values(container.NetworkSettings.Networks)[0] as any)
        .IPAddress,
      user: env.POSTGRES_USER,
      password: readFileSync(secret, "utf8").trim(),
      database: "athyper_studio",
      max: 1,
    }),
  }),
});
let temporary: string | undefined;
try {
  const result = await database
    .transaction()
    .execute((tx) => installLocalPublicationConfiguration(tx, config));
  // A file-write failure leaves only an inert host tuple; rerun safely completes
  // configuration. Neither step creates an approval or admits an exact request.
  temporary = configPath + "." + randomUUID() + ".tmp";
  writeFileSync(temporary, JSON.stringify(raw, null, 2) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
  renameSync(temporary, configPath);
  temporary = undefined;
  console.log(
    JSON.stringify(
      {
        schema: "athyper.local-publication-installation/1",
        ...result,
        configured: true,
        restartRequired: true,
        publicationExecuted: false,
      },
      null,
      2,
    ),
  );
} finally {
  if (temporary) unlinkSync(temporary);
  await database.destroy();
}
