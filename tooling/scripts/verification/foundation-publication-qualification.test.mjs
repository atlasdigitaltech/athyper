import assert from "node:assert/strict";
import { test } from "node:test";
import {
  assemblyPassed,
  assessCompiler,
  assessTap,
  checks,
} from "./qualify-foundation-publication.mjs";

test("compiler pin requires the actual compiler identity contract", () => {
  const compiler = {
    name: "athyper.compiled-entity-artifact",
    version: "1.1.0",
    buildHash: "a".repeat(64),
  };
  assert.equal(
    assessCompiler({ status: 0 }, JSON.stringify(compiler)).passed,
    true,
  );
  for (const invalid of [
    undefined,
    {},
    { ...compiler, name: "substituted" },
    { ...compiler, version: "" },
    { ...compiler, buildHash: "missing" },
  ])
    assert.equal(
      assessCompiler({ status: 0 }, JSON.stringify(invalid)).passed,
      false,
    );
  assert.equal(
    assessCompiler({ status: 1 }, JSON.stringify(compiler)).passed,
    false,
  );
});

test("assembly cannot pass with missing, duplicated, failed or changed-source evidence", () => {
  const source = { treeSha256: "captured-bytes", revision: "candidate-commit" };
  const results = checks.map((check) => ({ id: check.id, passed: true }));
  assert.equal(assemblyPassed(source, source, results), true);
  assert.equal(assemblyPassed(source, source, []), false);
  for (const check of checks) {
    assert.equal(
      assemblyPassed(
        source,
        source,
        results.filter((result) => result.id !== check.id),
      ),
      false,
    );
    assert.equal(
      assemblyPassed(source, source, [
        ...results,
        { id: check.id, passed: true },
      ]),
      false,
    );
    assert.equal(
      assemblyPassed(
        source,
        source,
        results.map((result) =>
          result.id === check.id ? { ...result, passed: false } : result,
        ),
      ),
      false,
    );
  }
  assert.equal(
    assemblyPassed(source, { ...source, treeSha256: "changed" }, results),
    false,
  );
  assert.equal(
    assemblyPassed(source, { ...source, revision: "substituted" }, results),
    false,
  );
});

test("disposable node tests require substantive executed results without skips", () => {
  const tap = "# pass 1\n# fail 0\n# skipped 0\n# todo 0\n";
  assert.equal(assessTap({ status: 0 }, tap).passed, true);
  for (const log of [
    "",
    tap.replace("pass 1", "pass 0"),
    tap.replace("fail 0", "fail 1"),
    tap.replace("skipped 0", "skipped 1"),
    tap.replace("todo 0", "todo 1"),
    tap.replace("# todo 0\n", ""),
  ])
    assert.equal(assessTap({ status: 0 }, log).passed, false);
  assert.equal(assessTap({ status: 1 }, tap).passed, false);
  assert.equal(
    assessTap({ status: null, error: "spawn failed" }, tap).passed,
    false,
  );
});

test("publication checks retain exact security files and separate fresh/upgrade receipts", () => {
  const codegen = checks.find((check) => check.id === "readiness-codegen");
  assert.equal(codegen.generated.length, 3);
  assert.ok(
    checks.indexOf(codegen) <
      checks.findIndex((check) => check.id === "readiness-typecheck"),
  );
  assert.ok(codegen.args.includes("codegen"));
  assert.equal(new Set(checks.map((check) => check.id)).size, checks.length);
  assert.ok(
    checks
      .find((check) => check.id === "publication")
      .files.includes("src/publication-rollback.test.ts"),
  );
  assert.ok(
    checks
      .find((check) => check.id === "host")
      .files.includes(
        "src/composition/shared/verification-permissions.test.ts",
      ),
  );
  assert.ok(
    checks
      .find((check) => check.id === "publication-concurrency-recovery")
      .args.includes(
        "server/db/scripts/tests/integration/publication-concurrency-recovery.test.mjs",
      ),
  );
  assert.ok(
    checks
      .find((check) => check.id === "principal-source-upgrade")
      .args.includes("--upgrade"),
  );
  assert.ok(
    !checks
      .find((check) => check.id === "principal-source-fresh")
      .args.includes("--upgrade"),
  );
});

test("readiness qualification includes real inventory SQL, compiler/authoring roundtrip and serving admission", () => {
  const expected = {
    "readiness-contracts": [
      "src/entity-readiness.test.ts",
      "src/entity-support-receipt.test.ts",
      "src/entity-capability-requirements.test.ts",
    ],
    "deployment-support": [
      "src/entity-deployment-support.test.ts",
      "src/entity-readiness-declaration.test.ts",
      "src/entity-readiness-inventory.test.ts",
      "src/entity-readiness-inventory.postgres.test.ts",
    ],
    "authoring-readiness": [
      "src/authoring/country-ai.test.ts",
      "src/authoring/table-product-storage-plane.test.ts",
    ],
    "ai-manifest-readiness": ["src/entity-tool-manifest.test.ts"],
    publication: ["src/entity-ai-manifest-compiler.test.ts"],
    host: [
      "src/composition/shared/entity-runtime/deployment-readiness.test.ts",
      "src/composition/shared/entity-runtime/readiness-inventory.test.ts",
      "src/composition/shared/entity-runtime/__tests__/published-parent-admission.test.ts",
      "src/composition/shared/entity-runtime/__tests__/entity-activity-provider.test.ts",
      "src/composition/shared/publication/tenant-rollback.test.ts",
    ],
  };
  for (const [id, files] of Object.entries(expected)) {
    const check = checks.find((entry) => entry.id === id);
    for (const file of files)
      assert.ok(check?.files.includes(file), `${id}: ${file}`);
  }
});
