import { readFileSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));

export const defaultRepoRoot = resolve(here, "../../..");

export function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}

export function listYaml(directory) {
  return readdirSync(directory)
    .filter((name) => /\.ya?ml$/u.test(name))
    .sort()
    .map((name) => join(directory, name));
}

export function runReadOnly(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    timeout: options.timeout ?? 8_000,
    windowsHide: true,
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: (result.stdout ?? "").trim(),
    stderr: (result.stderr ?? "").trim(),
    error: result.error?.message,
  };
}

export function runtimeRoot() {
  return join(homedir(), ".athyper");
}

export function modeBits(path) {
  return statSync(path).mode & 0o777;
}

export function parseVersion(value) {
  const match = String(value).match(/(\d+)\.(\d+)\.(\d+)/u);
  return match ? match.slice(1).map(Number) : null;
}

export function versionAtLeast(value, minimum) {
  const actual = parseVersion(value);
  const floor = parseVersion(minimum);
  if (!actual || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (actual[index] > floor[index]) return true;
    if (actual[index] < floor[index]) return false;
  }
  return true;
}
