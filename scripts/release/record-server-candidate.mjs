#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const output = join(root, "docs", "architecture", "evidence", "server-candidate-verification.json");
const run = process.argv.includes("--run");
const command = (file, args) => {
  const invocation = process.platform === "win32" && file.endsWith(".cmd")
    ? [process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [file, ...args].join(" ")]]
    : [file, args];
  return execFileSync(invocation[0], invocation[1], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
};
const safe = (work) => { try { return { status: "passed", output: work() }; } catch (error) { return { status: "failed", output: error instanceof Error ? `${error.stdout ?? ""}${error.stderr ?? ""}${error.message}`.trim() : String(error) }; } };
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const git = (args) => safe(() => command("git", args));
const checks = run ? [
  ["typecheck", ["--dir", "server", "run", "typecheck"]],
  ["test", ["--dir", "server", "run", "test"]],
  ["build", ["--dir", "server", "run", "build"]],
  ["openapi", ["openapi:check"]],
  ["routeManifest", ["routes:server-manifest:check"]],
  ["deploymentProfiles", ["policy:deployment-profiles"]],
] : [];
const profileDocument = JSON.parse(readFileSync(join(root, "config", "deployment", "profiles.json"), "utf8")).profiles;
const document = {
  schemaVersion: 1,
  recordedAt: new Date().toISOString(),
  candidate: { commit: git(["rev-parse", "HEAD"]), branch: git(["branch", "--show-current"]), worktree: git(["status", "--porcelain=v1"]), clean: false },
  toolchain: { node: process.version, pnpm: safe(() => command(pnpm, ["--version"])) },
  profiles: Object.keys(profileDocument),
  serviceEndpoints: Object.fromEntries(Object.entries(profileDocument).map(([name, profile]) => [name, profile.healthChecks ?? []])),
  checks: Object.fromEntries(checks.map(([name, args]) => [name, safe(() => command(pnpm, args))])),
};
document.candidate.clean = document.candidate.worktree.status === "passed" && !document.candidate.worktree.output;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
console.log(`Recorded server candidate verification at ${output.replace(root + "\\", "")}. ${document.candidate.clean ? "Clean" : "Dirty"} worktree.`);
if (!document.candidate.clean) process.exitCode = 2;
if (Object.values(document.checks).some((result) => result.status !== "passed")) process.exitCode = 1;
