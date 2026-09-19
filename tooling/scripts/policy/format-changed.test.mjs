import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedPaths, formatPaths } from "./format-changed.mjs";

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), "format-changed-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "fixture@example.test");
  git("config", "user.name", "Fixture");
  for (const name of [
    "unchanged.js",
    "staged.js",
    "unstaged.js",
    "deleted.js",
    "old.js",
  ])
    writeFileSync(join(cwd, name), "const x=1");
  git("add", ".");
  git("commit", "-qm", "fixture");
  return { cwd, git };
}

test("selects staged, unstaged, untracked and renamed paths, excluding deletions and unchanged drift", (t) => {
  const { cwd, git } = fixture(t);
  writeFileSync(join(cwd, "staged.js"), "const x=2");
  git("add", "staged.js");
  writeFileSync(join(cwd, "unstaged.js"), "const x=3");
  writeFileSync(join(cwd, "new [literal] file.js"), "const x=4");
  git("rm", "-q", "deleted.js");
  git("mv", "old.js", "renamed.js");
  assert.deepEqual(changedPaths({ cwd }).paths, [
    "new [literal] file.js",
    "renamed.js",
    "staged.js",
    "unstaged.js",
  ]);
});

test("PR and push baselines include committed changes; invalid or missing CI baselines fail", (t) => {
  const { cwd, git } = fixture(t);
  const base = git("rev-parse", "HEAD");
  writeFileSync(join(cwd, "staged.js"), "const x=2");
  git("add", ".");
  git("commit", "-qm", "change");
  assert.deepEqual(
    changedPaths({
      cwd,
      event: { pull_request: { base: { sha: base } } },
      ci: true,
    }).paths,
    ["staged.js"],
  );
  assert.deepEqual(
    changedPaths({ cwd, event: { before: base }, ci: true }).paths,
    ["staged.js"],
  );
  assert.throws(() => changedPaths({ cwd, base: "nonexistent" }));
  assert.throws(() => changedPaths({ cwd, ci: true }), /requires a PR base/);
});

test("format checking fails malformed or unformatted files and writing respects ignores and literal filenames", async (t) => {
  const { cwd } = fixture(t);
  writeFileSync(join(cwd, ".prettierignore"), "ignored.js\n");
  writeFileSync(join(cwd, "ignored.js"), "const ignored=1");
  writeFileSync(join(cwd, "name [literal].js"), "const x=1");
  const paths = ["name [literal].js", "ignored.js"];
  assert.equal((await formatPaths(paths, { cwd })).failed.length, 1);
  await formatPaths(paths, { cwd, write: true });
  assert.equal((await formatPaths(paths, { cwd })).failed.length, 0);
  assert.equal(
    readFileSync(join(cwd, "ignored.js"), "utf8"),
    "const ignored=1",
  );
  writeFileSync(join(cwd, "broken.js"), "const = {");
  assert.equal((await formatPaths(["broken.js"], { cwd })).failed.length, 1);
});
