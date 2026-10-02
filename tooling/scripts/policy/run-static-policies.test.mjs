import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { runPolicies, selectPolicies } from "./run-static-policies.mjs";

test("profile validation rejects missing, empty and recursive selections and deduplicates names", () => {
  const document = {
    schemaVersion: 1,
    profiles: { ci: ["policy:a", "policy:a", "policy:b"], empty: [] },
  };
  assert.deepEqual(
    selectPolicies(document, "ci", {
      "policy:a": "node a.mjs",
      "policy:b": "node b.mjs",
    }),
    ["policy:a", "policy:b"],
  );
  assert.throws(
    () => selectPolicies(document, "missing", {}),
    /Unknown or empty/,
  );
  assert.throws(
    () => selectPolicies(document, "empty", {}),
    /Unknown or empty/,
  );
  assert.throws(() => selectPolicies(document, "ci", {}), /Missing or invalid/);
  assert.throws(
    () =>
      selectPolicies(document, "ci", {
        "policy:a": "node run-static-policies.mjs",
      }),
    /Recursive/,
  );
});

test("real failed subprocess retains output and does not prevent later checks", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "static-policy-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const scripts = {
    "policy:bad": "console.error('controlled violation'); process.exit(7)",
    "policy:good": "console.log('positive evidence')",
  };
  const output = join(cwd, "logs");
  const report = runPolicies(Object.keys(scripts), {
    cwd,
    output,
    execute: (_command, args, options) =>
      spawnSync(process.execPath, ["-e", scripts[args[1]]], options),
  });
  assert.equal(report.failed, 1);
  assert.equal(report.results[0].exitCode, 7);
  assert.equal(report.results[1].status, "passed");
  assert.match(
    readFileSync(join(output, "policy-bad.log"), "utf8"),
    /controlled violation/,
  );
  assert.match(
    readFileSync(join(output, "policy-good.log"), "utf8"),
    /positive evidence/,
  );
  assert.equal(JSON.parse(readFileSync(join(output, "results.json"))).total, 2);
});

test("spawn errors and timeouts are failures and leave diagnostics", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "static-policy-errors-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const report = runPolicies(["policy:missing", "policy:timeout"], {
    cwd,
    output: cwd,
    timeout: 50,
    execute: (_command, args, options) =>
      args[1] === "policy:missing"
        ? spawnSync(join(cwd, "does-not-exist"), [], options)
        : spawnSync(
            process.execPath,
            ["-e", "setInterval(() => {}, 1000)"],
            options,
          ),
  });
  assert.equal(report.failed, 2);
  assert.match(report.results[0].error, /ENOENT/);
  assert.match(report.results[1].error, /ETIMEDOUT/);
});

test("all checked-in profiles resolve real non-recursive scripts; CI includes both existing policy groups", () => {
  const root = new URL("../../../", import.meta.url);
  const document = JSON.parse(
    readFileSync(
      new URL("governance/config/governance/static-policy-profiles.json", root),
    ),
  );
  const scripts = JSON.parse(
    readFileSync(new URL("package.json", root)),
  ).scripts;
  for (const profile of Object.keys(document.profiles))
    selectPolicies(document, profile, scripts);
  for (const name of [
    ...document.profiles.workspace,
    ...document.profiles.release,
  ])
    assert.ok(document.profiles.ci.includes(name), name);
});

test("CLI exits nonzero after failures and zero when every required check passes", (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "static-policy-cli-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  mkdirSync(join(cwd, "governance/config/governance"), { recursive: true });
  writeFileSync(
    join(cwd, "governance/config/governance/static-policy-profiles.json"),
    JSON.stringify({ schemaVersion: 1, profiles: { ci: ["policy:probe"] } }),
  );
  writeFileSync(join(cwd, ".gitignore"), "evidence/\n");
  assert.equal(spawnSync("git", ["init", "-q"], { cwd }).status, 0);
  assert.equal(
    spawnSync(
      "git",
      [
        "-c",
        "user.name=Fixture",
        "-c",
        "user.email=fixture@example.test",
        "commit",
        "--allow-empty",
        "-qm",
        "fixture",
      ],
      { cwd },
    ).status,
    0,
  );
  const cli = new URL("./run-static-policies.mjs", import.meta.url);
  for (const exitCode of [5, 0]) {
    writeFileSync(
      join(cwd, "package.json"),
      JSON.stringify({
        scripts: {
          "policy:probe": `node -e "console.log('probe evidence'); process.exit(${exitCode})"`,
        },
      }),
    );
    const result = spawnSync(
      process.execPath,
      [cli.pathname, "--profile", "ci"],
      {
        cwd,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: "",
          ATHYPER_ARTIFACT_ROOT: join(cwd, "evidence"),
          ATHYPER_ARTIFACT_RUN_ID: `test-${exitCode}`,
        },
      },
    );
    assert.equal(result.status, exitCode ? 1 : 0, result.stderr);
    const report = JSON.parse(
      readFileSync(
        join(cwd, `evidence/static-policy/test-${exitCode}/ci/results.json`),
      ),
    );
    assert.equal(report.total, 1);
    assert.equal(report.failed, exitCode ? 1 : 0);
    const gate = JSON.parse(
      readFileSync(
        join(cwd, `evidence/static-policy/test-${exitCode}/ci/gate.json`),
      ),
    );
    assert.equal(gate.sourceStable, true);
    assert.equal(gate.passed, exitCode === 0);
  }
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({
      scripts: {
        "policy:probe": `node -e "require('node:fs').writeFileSync('changed.txt', 'new source')"`,
      },
    }),
  );
  const changed = spawnSync(
    process.execPath,
    [cli.pathname, "--profile", "ci", "--deliverable", "D8"],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_STEP_SUMMARY: "",
        ATHYPER_ARTIFACT_ROOT: join(cwd, "evidence"),
        ATHYPER_ARTIFACT_RUN_ID: "drift",
      },
    },
  );
  assert.equal(changed.status, 1, changed.stderr);
  const gate = JSON.parse(
    readFileSync(join(cwd, "evidence/static-policy/drift/ci/D8/gate.json")),
  );
  assert.equal(gate.deliverable, "D8");
  assert.equal(gate.sourceStable, false);
  assert.deepEqual(gate.failedPolicies, []);
  assert.equal(gate.passed, false);
  const repeated = spawnSync(
    process.execPath,
    [cli.pathname, "--profile", "ci", "--deliverable", "D8"],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        ATHYPER_ARTIFACT_ROOT: join(cwd, "evidence"),
        ATHYPER_ARTIFACT_RUN_ID: "drift",
      },
    },
  );
  assert.equal(repeated.status, 1);
  assert.match(repeated.stderr, /evidence already exists/);
  for (const args of [
    ["--profile", "wave1", "--deliverable", "D8"],
    ["--profile", "ci", "--deliverable", "D11"],
  ]) {
    const invalid = spawnSync(process.execPath, [cli.pathname, ...args], {
      cwd,
      encoding: "utf8",
    });
    assert.equal(invalid.status, 1);
  }
});
