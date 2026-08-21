#!/usr/bin/env node
/**
 * Gate 2 — Workspace dependency resolution verifier.
 *
 * After `pnpm install`, every package.json that declares a `workspace:*`
 * dependency must resolve to an active workspace member.  This script makes
 * that invariant explicit and machine-readable rather than relying on pnpm's
 * opaque install-time errors.
 *
 * A violation here means:
 *   - A package was removed from pnpm-workspace.yaml but its consumers were
 *     not updated, or
 *   - A new workspace:* dep was added before the target package exists.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const posix = (p) => p.replaceAll("\\", "/");
const depSections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const violations = [];

// ── 1. Query active workspace packages ───────────────────────────────────────

let activePkgs;
try {
  const args = ["list", "-r", "--depth", "-1", "--json"];
  const output = process.platform === "win32"
    ? execFileSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", `pnpm.cmd ${args.join(" ")}`], { cwd: root, encoding: "utf8" })
    : execFileSync("pnpm", args, { cwd: root, encoding: "utf8" });
  activePkgs = JSON.parse(output);
} catch (err) {
  console.error(`Failed to query pnpm workspace packages: ${err.message}`);
  process.exit(1);
}

const activeNames = new Set(activePkgs.map((p) => p.name));

// ── 2. Check every active package for unresolvable workspace:* deps ──────────

for (const pkg of activePkgs) {
  const manifestPath = join(pkg.path, "package.json");
  if (!existsSync(manifestPath)) continue;

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    continue;
  }

  const pkgRel = posix(relative(root, pkg.path));

  for (const section of depSections) {
    const deps = manifest[section] ?? {};
    for (const [dep, version] of Object.entries(deps)) {
      if (typeof version !== "string" || !version.startsWith("workspace:")) continue;
      if (!activeNames.has(dep)) {
        violations.push(`${pkgRel}/package.json  ${section}.${dep} = "${version}" — target not in active workspace`);
      }
    }
  }
}

// ── 3. Report ─────────────────────────────────────────────────────────────────

if (violations.length > 0) {
  console.error(
    ["Unresolvable workspace:* dependencies detected:", ...violations.map((v) => `  · ${v}`)].join("\n"),
  );
  console.error(
    `\n${violations.length} violation(s). Add the missing package to pnpm-workspace.yaml or update the dep version.`,
  );
  process.exit(1);
}

console.log(
  `Workspace resolution verified — ${activePkgs.length} active packages, no unresolvable workspace:* deps.`,
);
