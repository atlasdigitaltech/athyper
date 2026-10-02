import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { capturePolicySource } from "./static-policy-source.mjs";

test("source pin captures dirty and untracked bytes, symlinks and executable mode while ignoring generated output", (t) => {
  const temporary = mkdtempSync(join(tmpdir(), "policy-source-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const cwd = join(temporary, "repo");
  mkdirSync(cwd);
  const git = (...args) => execFileSync("git", args, { cwd });
  git("init", "-q");
  writeFileSync(join(cwd, ".gitignore"), ".next*/\ndist/\n");
  writeFileSync(join(cwd, "source.ts"), "original");
  git("add", ".");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.test",
    "commit",
    "-qm",
    "fixture",
  );
  assert.equal(capturePolicySource(cwd).clean, true);
  writeFileSync(join(cwd, "source.ts"), "dirty");
  writeFileSync(join(cwd, "untracked.ts"), "untracked");
  symlinkSync("source.ts", join(cwd, "link.ts"));
  const output = join(temporary, "evidence");
  const before = capturePolicySource(cwd, output);
  assert.equal(before.clean, false);
  for (const file of before.files) {
    const bytes = readFileSync(
      join(output, "source-blobs", file.sha256),
      "utf8",
    );
    if (file.path === "source.ts") assert.equal(bytes, "dirty");
    if (file.path === "untracked.ts") assert.equal(bytes, "untracked");
    if (file.path === "link.ts") {
      assert.equal(file.kind, "symlink");
      assert.equal(bytes, "source.ts");
    }
  }
  for (const directory of ["dist", ".next", ".next-preview"]) {
    mkdirSync(join(cwd, directory));
    writeFileSync(join(cwd, directory, "generated.ts"), "output");
  }
  assert.equal(capturePolicySource(cwd).fingerprint, before.fingerprint);
  chmodSync(join(cwd, "source.ts"), 0o755);
  assert.notEqual(capturePolicySource(cwd).fingerprint, before.fingerprint);
  unlinkSync(join(cwd, "source.ts"));
  assert.equal(
    capturePolicySource(cwd).files.find((file) => file.path === "source.ts")
      .kind,
    "deleted",
  );
});
