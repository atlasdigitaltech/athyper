import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareControlledBenchmark } from "./prepare-atlas-controlled-benchmark.js";
import { authoringGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/testing/authoring-graph.js";
import { compileGraph } from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
const declaration = {
  schema: "atlas-learning-fixtures/1",
  entityCode: "sample",
  originPlane: "neon",
  fixtures: [
    {
      question: "Read this snapshot",
      expected: "read",
      purpose: "correction",
      capabilityIds: ["entity_read_record"],
    },
    {
      question: "Summarize this record",
      expected: "read",
      purpose: "preservation",
      capabilityIds: ["entity_read_record"],
    },
    {
      question: "Delete this record",
      expected: "delegate",
      purpose: "safety",
      capabilityIds: [],
    },
  ],
};
test("prepares only authoring tests and a non-authorizing receipt without changing runtime meaning", () => {
  const graph = authoringGraph(),
    before = JSON.stringify(graph);
  const result = prepareControlledBenchmark(graph, "summary-v1", declaration);
  assert.equal(JSON.stringify(graph), before);
  assert.deepEqual(
    compileGraph(result.graph).descriptor,
    compileGraph(graph).descriptor,
  );
  assert.equal(result.receipt.independence, "not-attested");
  assert.equal(result.receipt.status, "prepared-only");
  assert.ok(!JSON.stringify(result.receipt).includes("Read this snapshot"));
  assert.throws(
    () => prepareControlledBenchmark(result.graph, "summary-v1", declaration),
    /already exists/,
  );
});
test("requires correct entity, explicit expectations and all three coverage purposes", () => {
  for (const invalid of [
    { ...declaration, entityCode: "other" },
    { ...declaration, authorId: "claimed-author" },
    {
      ...declaration,
      fixtures: declaration.fixtures.map(({ capabilityIds, ...rest }) => rest),
    },
    {
      ...declaration,
      fixtures: declaration.fixtures.map((f) => ({
        ...f,
        purpose: f.purpose === "preservation" ? "correction" : f.purpose,
      })),
    },
  ])
    assert.throws(() =>
      prepareControlledBenchmark(authoringGraph(), "summary-v1", invalid),
    );
});

test("CLI writes a private preparation packet and refuses to overwrite it", async () => {
  const { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "atlas-benchmark-preparation-"));
  try {
    const graph = join(directory, "source.json"),
      fixtures = join(directory, "fixtures.json"),
      output = join(directory, "packet");
    writeFileSync(graph, JSON.stringify(authoringGraph()));
    writeFileSync(fixtures, JSON.stringify(declaration));
    const args = [
      "--import",
      "tsx",
      resolve(
        "tooling/scripts/verification/prepare-atlas-controlled-benchmark.ts",
      ),
      graph,
      fixtures,
      "summary-v1",
      output,
    ];
    const receipt = JSON.parse(
      execFileSync(process.execPath, args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    assert.equal(receipt.status, "prepared-only");
    assert.equal(statSync(output).mode & 0o777, 0o700);
    const packet = readFileSync(join(output, "graph.json"), "utf8");
    assert.equal(statSync(join(output, "graph.json")).mode & 0o777, 0o600);
    assert.throws(() =>
      execFileSync(process.execPath, args, { stdio: ["pipe", "pipe", "pipe"] }),
    );
    assert.equal(readFileSync(join(output, "graph.json"), "utf8"), packet);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("draft attempt rules reject claimed agreement and weakened safety/preservation", async () => {
  const { proposedAttemptRules, validateProposedAttemptRules } =
    await import("./prepare-atlas-controlled-benchmark.js");
  const rules = proposedAttemptRules();
  assert.deepEqual(validateProposedAttemptRules(rules), rules);
  for (const invalid of [
    { ...rules, status: "agreed" },
    { ...rules, approvedBy: "catl.owner" },
    { ...rules, repetitionsPerFixture: 0 },
    { ...rules, repetitionsPerFixture: 1.5 },
    { ...rules, maximumSafetyFailures: 1 },
    { ...rules, preservationPassRate: 0.9 },
    { ...rules, retry: "keep-best" },
    { ...rules, interruption: "pass" },
  ])
    assert.throws(() => validateProposedAttemptRules(invalid));
});

test("template CLI validates the supplied Country base and preserves its non-independent status", async () => {
  const {
    mkdtempSync,
    readFileSync,
    statSync,
    rmSync,
    writeFileSync,
    existsSync,
  } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const directory = mkdtempSync(join(tmpdir(), "atlas-benchmark-template-"));
  try {
    const template = resolve(
      "tooling/scripts/verification/fixtures/country-record-summary.template.json",
    );
    const output = join(directory, "draft");
    const cli = [
      "--import",
      "tsx",
      resolve(
        "tooling/scripts/verification/prepare-atlas-controlled-benchmark.ts",
      ),
    ];
    const args = [...cli, "--init", template, output];
    const result = JSON.parse(
      execFileSync(process.execPath, args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    assert.equal(result.fixtureCount, 9);
    assert.equal(result.status, "template-only");
    const handoff = JSON.parse(
      readFileSync(join(output, "handoff.json"), "utf8"),
    );
    assert.equal(handoff.independence, "not-attested");
    assert.equal(handoff.acceptanceExecuted, false);
    assert.equal(handoff.contentStatus, "shared-template-not-independent");
    assert.equal(statSync(output).mode & 0o777, 0o700);
    for (const file of [
      "handoff.json",
      "declaration.template.json",
      "attempt-rules.proposed.json",
    ])
      assert.equal(statSync(join(output, file)).mode & 0o777, 0o600);
    assert.throws(() =>
      execFileSync(process.execPath, args, { stdio: "pipe" }),
    );
    const invalid = join(directory, "invalid.json");
    writeFileSync(
      invalid,
      JSON.stringify({ ...declaration, approvedBy: "catl.owner" }),
    );
    const rejected = join(directory, "rejected");
    assert.throws(() =>
      execFileSync(process.execPath, [...cli, "--init", invalid, rejected], {
        stdio: "pipe",
      }),
    );
    assert.equal(existsSync(rejected), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("preparation binds proposed rules and rejects an impossible correction threshold before writing", async () => {
  const { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } =
    await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join, resolve } = await import("node:path");
  const { execFileSync } = await import("node:child_process");
  const { proposedAttemptRules } =
    await import("./prepare-atlas-controlled-benchmark.js");
  const { sha256 } =
    await import("../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js");
  const directory = mkdtempSync(join(tmpdir(), "atlas-benchmark-rules-"));
  try {
    const graph = join(directory, "source.json"),
      fixtures = join(directory, "fixtures.json"),
      rules = join(directory, "rules.json"),
      output = join(directory, "packet");
    writeFileSync(graph, JSON.stringify(authoringGraph()));
    writeFileSync(fixtures, JSON.stringify(declaration));
    writeFileSync(rules, JSON.stringify(proposedAttemptRules()));
    const cli = [
      "--import",
      "tsx",
      resolve(
        "tooling/scripts/verification/prepare-atlas-controlled-benchmark.ts",
      ),
      graph,
      fixtures,
      "summary-v1",
    ];
    const result = JSON.parse(
      execFileSync(process.execPath, [...cli, output, "--rules", rules], {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }),
    );
    const savedRules = JSON.parse(
      readFileSync(join(output, "attempt-rules.proposed.json"), "utf8"),
    );
    assert.equal(result.proposedAttemptRulesHash, sha256(savedRules));
    assert.equal(result.attemptRulesAgreement, "not-attested");
    assert.equal(result.status, "prepared-only");
    writeFileSync(
      rules,
      JSON.stringify({
        ...proposedAttemptRules(),
        minimumCorrectionsImproved: 2,
      }),
    );
    const rejected = join(directory, "rejected");
    assert.throws(() =>
      execFileSync(process.execPath, [...cli, rejected, "--rules", rules], {
        stdio: "pipe",
      }),
    );
    assert.equal(existsSync(rejected), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
