import { test } from "node:test";
import assert from "node:assert/strict";
import {
  commands,
  verifyCommand,
  verifyWorkflow,
} from "./verify-ci-entrypoints.mjs";

const options = {
  cwd: "/repo",
  packages: [
    {
      name: "@athyper/server-db",
      path: "/repo/server/db",
      scripts: { test: "node test.mjs" },
    },
  ],
  exists: (path) => ["/repo/package.json", "/repo/real.mjs"].includes(path),
  manifest: () => ({ name: "root", scripts: { policy: "node real.mjs" } }),
};
test("rejects obsolete packages even if pnpm would exit zero", () =>
  assert.match(
    verifyCommand(
      commands("pnpm --filter @athyper/db run test")[0],
      options,
    ).join("\n"),
    /matches no workspace/,
  ));
test("requires an empty-match failure guard and a real script", () => {
  assert.match(
    verifyCommand(
      commands("pnpm --filter @athyper/server-db run test")[0],
      options,
    ).join("\n"),
    /fail-if-no-match/,
  );
  assert.match(
    verifyCommand(
      commands(
        "pnpm --fail-if-no-match --filter @athyper/server-db run missing",
      )[0],
      options,
    ).join("\n"),
    /missing script/,
  );
  assert.deepEqual(
    verifyCommand(
      commands(
        "pnpm --fail-if-no-match --filter @athyper/server-db run test",
      )[0],
      options,
    ),
    [],
  );
});
test("checks literal node and npx executable paths", () => {
  for (const command of [
    "node gone.mjs",
    "npx tsx gone.ts",
    "pnpm exec tsx gone.ts",
  ])
    assert.match(
      verifyCommand(commands(command)[0], options).join("\n"),
      /missing executable/,
    );
  assert.deepEqual(verifyCommand(commands("node real.mjs")[0], options), []);
});
test("does not interpret echoed commands or heredoc data as execution", () => {
  const parsed = commands(
    "echo \"node gone.mjs\"\ncat <<'SQL'\nnode gone.mjs\nSQL\nnode real.mjs",
  );
  assert.equal(parsed.length, 3);
  assert.deepEqual(
    parsed.flatMap((command) => verifyCommand(command, options)),
    [],
  );
});
test("rejects dynamic executable coordinates but allows script arguments", () => {
  assert.match(
    verifyCommand(commands('pnpm --filter "$PACKAGE" test')[0], options).join(
      "\n",
    ),
    /dynamic/,
  );
  assert.match(
    verifyCommand(commands('node "$SCRIPT.mjs"')[0], options).join("\n"),
    /dynamic/,
  );
  assert.deepEqual(
    verifyCommand(commands('pnpm policy --snapshot="$SNAPSHOT"')[0], options),
    [],
  );
});
test("inspects every command in a multiline workflow step", () =>
  assert.equal(
    verifyWorkflow(
      "jobs:\n  verify:\n    steps:\n      - run: |\n          pnpm policy && node gone.mjs\n          pnpm missing\n",
      options,
    ).length,
    2,
  ));
test("rejects an empty workflow and removed required jobs", () => {
  assert.match(verifyWorkflow("jobs: {}", options).join("\n"), /no jobs/);
  assert.match(
    verifyWorkflow("jobs:\n  quality:\n    steps: []", {
      ...options,
      requiredJobs: ["rls-verify"],
    }).join("\n"),
    /required job missing/,
  );
});

test("Studio foundation independently runs complete suites and remains required", async () => {
  const { readFileSync } = await import("node:fs");
  const { parse } = await import("yaml");
  const workflow = parse(
    readFileSync(
      new URL("../../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    ),
  );
  const job = workflow.jobs["entity-studio-foundation"];
  assert.ok(job);
  assert.equal(job.needs, undefined);
  assert.equal(job.if, undefined);
  assert.equal(job["continue-on-error"], undefined);
  for (const pkg of [
    "@athyper/server-contract-meta-entity-authoring",
    "@athyper/server-plane-studio-meta-entity-authoring",
  ]) {
    const step = job.steps.find(
      (step) => step.run === `pnpm --fail-if-no-match --filter ${pkg} test`,
    );
    assert.ok(step, `missing full suite: ${pkg}`);
    assert.equal(
      step.if,
      "${{ !cancelled() && steps.install.outcome == 'success' }}",
    );
    assert.equal(step["continue-on-error"], undefined);
  }
  assert.ok(
    workflow.jobs["ci-success"].needs.includes("entity-studio-foundation"),
  );
  assert.ok(
    workflow.jobs["ci-success"].steps.some((step) =>
      step.run?.includes("needs.entity-studio-foundation.result"),
    ),
  );
  for (const flag of [
    "ATHYPER_SCOPED_GRAPH_POSTGRES",
    "ATHYPER_NATIVE_GRAPH_POSTGRES",
    "ATHYPER_NATIVE_AI_RECONCILIATION_POSTGRES",
    "ATHYPER_LEGACY_ENROLLMENT_POSTGRES",
    "ATHYPER_NATIVE_CONSTRAINT_POSTGRES",
    "ATHYPER_NATIVE_ROW_GUARDS_POSTGRES",
    "ATHYPER_NATIVE_AI_POSTGRES",
    "ATHYPER_NATIVE_OPERATION_POSTGRES",
    "ATHYPER_NATIVE_ROOT_POSTGRES",
  ]) {
    assert.ok(
      job.steps.some((step) => step.env?.[flag] === "1"),
      `missing PostgreSQL rehearsal: ${flag}`,
    );
  }
});
