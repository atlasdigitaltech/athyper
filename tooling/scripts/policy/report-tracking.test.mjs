import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");
const directory = "governance/policy/reports/";
const policy = JSON.parse(
  readFileSync(resolve(root, directory, "tracking-policy.json"), "utf8"),
);
const allowed = [
  ...policy.controlFiles,
  ...policy.allowlist.map((entry) => entry.path),
];
const ignored = (path) =>
  spawnSync("git", ["check-ignore", "--no-index", "-q", directory + path], {
    cwd: root,
  }).status;

test("reports are ignored by default with exact repository exceptions", () => {
  assert.equal(new Set(allowed).size, allowed.length);
  for (const path of allowed) {
    assert.ok(!path.includes("..") && !path.startsWith("/"));
    assert.equal(ignored(path), 1, `${path} must remain available to Git`);
  }
  for (const path of [
    "new-local-report.dev.json",
    "trace.log",
    "capture.png",
    "future/approval.json",
    "authorization/inventories/local-report.json",
  ])
    assert.equal(ignored(path), 0, `${path} must default to local-only`);
  const indexed = execFileSync("git", ["ls-files", "--", directory], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  for (const path of indexed)
    assert.ok(
      allowed.includes(path.slice(directory.length)),
      `Unexpected tracked local report: ${path}`,
    );
});

test("reviewed test inputs retain their exact checked bytes", () => {
  for (const entry of policy.allowlist) {
    const contents = readFileSync(resolve(root, directory, entry.path));
    if (entry.sha256)
      assert.equal(
        createHash("sha256").update(contents).digest("hex"),
        entry.sha256,
        `${entry.path}: review fixture changes before updating the allowlist checksum`,
      );
  }
});
