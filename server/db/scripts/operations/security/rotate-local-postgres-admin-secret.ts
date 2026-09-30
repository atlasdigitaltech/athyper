#!/usr/bin/env tsx

import { randomBytes } from "node:crypto";
import { chmod, open, readFile, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const confirmation = "ROTATE-LOCAL-DEV-POSTGRES-ADMIN";
if (!process.argv.includes(`--confirm=${confirmation}`)) {
  throw new Error(`local DEV rotation requires --confirm=${confirmation}`);
}

const runtimeRoot = process.env["ATHYPER_RUNTIME_ROOT"]?.trim()
  || resolve(process.env["HOME"] || "", ".athyper");
if (!runtimeRoot || runtimeRoot === "/" || !runtimeRoot.endsWith("/.athyper")) {
  throw new Error("ATHYPER_RUNTIME_ROOT must identify the local .athyper runtime root");
}
const secretPath = resolve(runtimeRoot, "instances/dev/secrets/postgres-password");
const temporaryPath = `${secretPath}.rotation-${process.pid}`;
const container = "athyper-dev-db-1";
const oldPassword = (await readFile(secretPath, "utf8")).trim();
if (!oldPassword) throw new Error("DEV postgres secret is empty");
const newPassword = randomBytes(48).toString("base64url");

function sql(password: string, statement: string): void {
  const result = spawnSync("docker", [
    "exec", "-i", "-e", `PGPASSWORD=${password}`, container,
    "psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres",
  ], { input: statement, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`PostgreSQL credential operation failed: ${(result.stderr || "unknown error").trim()}`);
}

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
let databaseChanged = false;
try {
  sql(oldPassword, `ALTER ROLE postgres PASSWORD ${literal(newPassword)};\n`);
  databaseChanged = true;

  const handle = await open(temporaryPath, "wx", 0o600);
  try {
    await handle.writeFile(`${newPassword}\n`, { encoding: "utf8" });
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(temporaryPath, 0o600);
  await rename(temporaryPath, secretPath);
  sql(newPassword, "SELECT 1;\n");
  process.stdout.write("DEV PostgreSQL administrator credential rotated and verified; secret material was not logged.\n");
} catch (error) {
  await rm(temporaryPath, { force: true }).catch(() => undefined);
  if (databaseChanged) {
    try { sql(newPassword, `ALTER ROLE postgres PASSWORD ${literal(oldPassword)};\n`); }
    catch { throw new Error("credential rotation failed and automatic database rollback also failed; operator recovery is required", { cause: error }); }
  }
  throw error;
}
