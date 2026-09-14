import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { snapshotCandidate } from "./candidate-snapshot.mjs";
test("snapshots tracked edits and new sources without changing the developer branch or index", async () => {
  const root = mkdtempSync(join(tmpdir(), "candidate-snapshot-test-")),
    repo = join(root, "repo"),
    candidate = join(root, "candidate");
  mkdirSync(repo);
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  try {
    git("init", "-q");
    writeFileSync(join(repo, "code.txt"), "before");
    writeFileSync(join(repo, ".gitignore"), "secret.txt\n");
    git("add", ".");
    git(
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "initial",
    );
    writeFileSync(join(repo, "code.txt"), "after");
    writeFileSync(join(repo, "new.txt"), "new source");
    writeFileSync(join(repo, "secret.txt"), "ignored");
    const status = git("status", "--porcelain"),
      head = git("rev-parse", "HEAD"),
      index = readFileSync(join(repo, ".git/index"));
    const receipt = await snapshotCandidate(repo, candidate);
    assert.equal(git("rev-parse", "HEAD"), head);
    assert.equal(git("status", "--porcelain"), status);
    assert.deepEqual(readFileSync(join(repo, ".git/index")), index);
    assert.equal(readFileSync(join(candidate, "code.txt"), "utf8"), "after");
    assert.equal(
      readFileSync(join(candidate, "new.txt"), "utf8"),
      "new source",
    );
    assert.equal(
      execFileSync("git", ["-C", candidate, "status", "--porcelain"], {
        encoding: "utf8",
      }).trim(),
      "",
    );
    assert.notEqual(receipt.sourceRevision, head);
    await assert.rejects(
      snapshotCandidate(repo, join(repo, "..candidate")),
      /outside/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
