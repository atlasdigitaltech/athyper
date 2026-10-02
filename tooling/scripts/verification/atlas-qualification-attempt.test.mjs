import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  startAtlasQualificationAttempt,
  finishAtlasQualificationAttempt,
} from "./atlas-qualification-attempt.mjs";

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), "atlas-attempt-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("crashed and completed attempt directories cannot be reused", (t) => {
  const output = join(workspace(t), "nested", "attempt");
  const attempt = startAtlasQualificationAttempt(output, { plane: "neon" });
  const started = readFileSync(join(output, "attempt-started.json"), "utf8");
  assert.equal(attempt.qualification, "implementation-diagnostic");
  assert.equal(statSync(output).mode & 0o777, 0o700);
  assert.equal(
    statSync(join(output, "attempt-started.json")).mode & 0o777,
    0o600,
  );
  assert.throws(
    () => startAtlasQualificationAttempt(output, { plane: "neon" }),
    { code: "EEXIST" },
  );
  finishAtlasQualificationAttempt(output, "report.json", attempt, {
    passed: false,
    failure: "interrupted",
  });
  const terminal = readFileSync(join(output, "report.json"), "utf8");
  assert.equal(JSON.parse(terminal).status, "failed");
  assert.equal(JSON.parse(terminal).attempt.attemptId, attempt.attemptId);
  assert.throws(
    () =>
      finishAtlasQualificationAttempt(output, "report.json", attempt, {
        passed: true,
      }),
    { code: "EEXIST" },
  );
  assert.throws(
    () => startAtlasQualificationAttempt(output, { plane: "neon" }),
    { code: "EEXIST" },
  );
  assert.equal(readFileSync(join(output, "report.json"), "utf8"), terminal);
  assert.equal(
    readFileSync(join(output, "attempt-started.json"), "utf8"),
    started,
  );
});

test("separate retries retain distinct identities and both outcomes", (t) => {
  const root = workspace(t);
  const attempts = [false, true].map((passed, index) => {
    const output = join(root, String(index));
    const attempt = startAtlasQualificationAttempt(output, { plane: "studio" });
    finishAtlasQualificationAttempt(output, "browser.json", attempt, {
      passed,
    });
    return JSON.parse(readFileSync(join(output, "browser.json"), "utf8"));
  });
  assert.deepEqual(
    attempts.map((item) => item.status),
    ["failed", "passed"],
  );
  assert.notEqual(attempts[0].attempt.attemptId, attempts[1].attempt.attemptId);
});

for (const [script, filename, args] of [
  [
    "qualify-country-atlas-dev.mjs",
    "browser.json",
    ["11111111-1111-4111-8111-111111111111"],
  ],
  ["qualify-atlas-model-dev.mjs", "report.json", []],
])
  test(`${script} preserves startup failure and refuses an overwrite before contacting DEV`, (t) => {
    const root = workspace(t),
      output = join(root, "attempt");
    const run = () =>
      spawnSync(
        process.execPath,
        [resolve("tooling/scripts/verification", script), ...args, output],
        {
          encoding: "utf8",
          timeout: 30000,
          env: {
            ...process.env,
            ATHYPER_ATLAS_PLANE: "neon",
            ATHYPER_BROWSER_STATE: join(root, "missing-session.json"),
            PLAYWRIGHT_BROWSERS_PATH: join(root, "missing-browsers"),
          },
        },
      );
    const first = run();
    assert.equal(first.status, 1, first.stderr);
    const bytes = readFileSync(join(output, filename), "utf8");
    const report = JSON.parse(bytes);
    assert.equal(report.status, "failed");
    assert.equal(report.passed, false);
    assert.ok(report.failure);
    assert.equal(report.attempt.qualification, "implementation-diagnostic");
    assert.deepEqual(report.checks, []);
    const second = run();
    assert.equal(second.status, 1);
    assert.match(second.stderr, /EEXIST/);
    assert.equal(readFileSync(join(output, filename), "utf8"), bytes);
  });
