#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { applyFoundation } from "./foundation-runner.js";

const PLANES = Object.freeze(["studio", "neon", "mesh"] as const);
type Plane = (typeof PLANES)[number];
const CONFIRMATION = "APPLY-BS360-DISPOSABLE-BASELINE";
const databaseRoot = resolve(import.meta.dirname, "../..");
const ddlRoot = resolve(databaseRoot, "ddl");

export async function applyDisposableDdlManifest(options: {
  readonly plane: Plane;
  readonly container: string;
  readonly databaseUser?: string;
  readonly confirmation: string;
}) {
  if (options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);
  if (!/^athyper-bs360-[a-z0-9-]+$/.test(options.container)) throw new Error("container must use the isolated athyper-bs360-* namespace");
  const user = options.databaseUser ?? "postgres";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(user)) throw new Error("database user must be a simple identifier");
  const inspection = JSON.parse(await capture("docker", ["inspect", options.container])) as readonly Readonly<{ State?: { Running?: boolean }; Config?: { Labels?: Record<string, string> } }>[];
  const target = inspection[0];
  if (!target?.State?.Running || target.Config?.Labels?.["athyper.environment"] !== "disposable_local" || target.Config?.Labels?.["athyper.purpose"] !== "business-partner-360-integration-baseline") throw new Error("target is not the running disposable BS360 baseline container");
  const database = `athyper_${options.plane}`;
  const actual = (await capture("docker", ["exec", options.container, "psql", "-U", user, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", "SELECT current_database()"])).trim();
  if (actual !== database) throw new Error(`expected ${database}, received ${actual}`);
  const blockers = Number((await capture("docker", ["exec", options.container, "psql", "-U", user, "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", "SELECT count(*) FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_'"])).trim());
  if (blockers !== 0) throw new Error(`${database} is not fresh; found ${blockers} non-system schemas`);

  return applyFoundation({
    plane: options.plane,
    dockerContainer: options.container,
    databaseUser: user,
  });
}

async function expandSql(path: string, stack: Set<string>): Promise<string> {
  const actual = await confined(path);
  if (stack.has(actual)) throw new Error(`recursive SQL include: ${relative(ddlRoot, actual)}`);
  stack.add(actual);
  try {
    const lines = (await readFile(actual, "utf8")).replace(/^\uFEFF/u, "").split(/\r?\n/u), output: string[] = [];
    for (const line of lines) {
      const match = line.match(/^\s*\\ir\s+(.+?)\s*$/u);
      if (!match) { output.push(line); continue; }
      const include = match[1]!.trim().replace(/^["']|["']$/gu, "");
      output.push(`-- begin included SQL: ${include}`, await expandSql(resolve(dirname(actual), include), stack), `-- end included SQL: ${include}`);
    }
    return output.join("\n");
  } finally { stack.delete(actual); }
}

async function confined(path: string) {
  const actual = await realpath(path), prefix = `${await realpath(ddlRoot)}${sep}`;
  if (!actual.startsWith(prefix)) throw new Error(`DDL path escapes root: ${path}`);
  return actual;
}
function sha256(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }
async function capture(command: string, args: readonly string[]) { return new Promise<string>((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], shell: false }); let stdout = "", stderr = ""; child.stdout.setEncoding("utf8").on("data", (part) => { stdout += part; }); child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolvePromise(stdout) : reject(new Error(`${command} failed (${code ?? "unknown"}): ${stderr.trim()}`))); }); }
async function pipe(command: string, args: readonly string[], input: string) { return new Promise<void>((resolvePromise, reject) => { const child = spawn(command, args, { stdio: ["pipe", "ignore", "pipe"], shell: false }); let stderr = ""; child.stderr.setEncoding("utf8").on("data", (part) => { stderr += part; }); child.once("error", reject); child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} failed (${code ?? "unknown"}): ${stderr.trim()}`))); child.stdin.end(input); }); }
function option(args: readonly string[], name: string) { return args.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1); }

async function main() {
  const args = process.argv.slice(2), plane = option(args, "--plane"), container = option(args, "--container"), confirmation = option(args, "--confirm");
  if (!PLANES.includes(plane as Plane) || !container || !confirmation) throw new Error("--plane=studio|neon|mesh, --container, and --confirm are required");
  process.stdout.write(`${JSON.stringify(await applyDisposableDdlManifest({ plane: plane as Plane, container, confirmation }), null, 2)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
