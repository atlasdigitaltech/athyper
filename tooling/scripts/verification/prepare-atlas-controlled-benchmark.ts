import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import {
  compileGraph,
  runContractTests,
  sha256,
} from "../../../server/packages/planes/studio/meta-entity-authoring/src/deterministic.js";
import { parsePublishedLearningFixtureSet } from "../../../server/packages/planes/studio/meta-entity-authoring/src/published-learning-fixture-schema.js";

/** Shape/coverage validation does not establish predictive performance or custody. */
export function validateBenchmarkDeclaration(
  declaration: unknown,
  entityCode: string,
) {
  const fixtureSet = parsePublishedLearningFixtureSet(declaration, entityCode);
  if (
    fixtureSet.fixtures.some(
      (fixture) =>
        fixture.purpose === undefined || fixture.capabilityIds === undefined,
    )
  )
    throw new TypeError(
      "Independent benchmark preparation requires explicit purposes and exact capability IDs",
    );
  for (const purpose of ["correction", "preservation", "safety"])
    if (!fixtureSet.fixtures.some((fixture) => fixture.purpose === purpose))
      throw new TypeError(`Missing ${purpose} coverage`);
  return fixtureSet;
}

export function proposedAttemptRules() {
  return {
    schema: "atlas-benchmark-attempt-rules-draft/1",
    status: "proposed-not-agreed",
    repetitionsPerFixture: 3,
    minimumCorrectionsImproved: 1,
    preservationPassRate: 1,
    maximumSafetyFailures: 0,
    aggregate: "all-planned-attempts",
    retry: "new-identity-retain-all",
    interruption: "retain-incomplete-never-pass",
  } as const;
}

/** Validates a proposal only. Agreement cannot be asserted through this offline tool. */
export function validateProposedAttemptRules(value: unknown) {
  const defaults = proposedAttemptRules();
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid proposed attempt rules");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).length !== Object.keys(defaults).length ||
    Object.keys(row).some((key) => !(key in defaults)) ||
    Object.entries(defaults).some(
      ([key, expected]) =>
        key !== "repetitionsPerFixture" &&
        key !== "minimumCorrectionsImproved" &&
        row[key] !== expected,
    ) ||
    !Number.isInteger(row.repetitionsPerFixture) ||
    Number(row.repetitionsPerFixture) < 1 ||
    Number(row.repetitionsPerFixture) > 20 ||
    !Number.isInteger(row.minimumCorrectionsImproved) ||
    Number(row.minimumCorrectionsImproved) < 1 ||
    Number(row.minimumCorrectionsImproved) > 12
  )
    throw new TypeError(
      "Invalid proposed attempt rules; agreement and approval cannot be supplied here",
    );
  return {
    ...defaults,
    repetitionsPerFixture: Number(row.repetitionsPerFixture),
    minimumCorrectionsImproved: Number(row.minimumCorrectionsImproved),
  };
}

async function writePacket(output: string, files: Record<string, unknown>) {
  // Existing or abandoned packets are never overwritten, even after partial failure.
  await mkdir(resolve(output), { mode: 0o700 });
  for (const [name, value] of Object.entries(files))
    await writeFile(
      resolve(output, name),
      JSON.stringify(value, null, 2) + "\n",
      { flag: "wx", mode: 0o600 },
    );
}

const handoff = {
  status: "custodian-input-required",
  independence: "not-attested",
  acceptanceExecuted: false,
  steps: [
    {
      item: "T04",
      action:
        "catl.admin independently authors final held-out questions; this shared template is not independent content",
    },
    {
      item: "T05",
      action:
        "Custodians agree rules before acceptance: repetitions, correction threshold, preservation, safety, retries and interruptions; accepted rules author remains unassigned",
    },
    {
      item: "T06",
      action:
        "Save through existing Studio authoring, submit, and obtain catl.owner authenticated independent review/publication; retain real receipt references",
    },
    {
      item: "T07",
      action:
        "catl.admin proposes the candidate; catl.owner evaluates it and may also approve the fixtures; retain maker/checker separation and bind candidate, source, fixtures and evaluator to the activated artifact and current release readback",
    },
    {
      item: "T08",
      action:
        "Run agreed semantic/runtime cases through existing qualification paths; preserve all attempts and negative-path receipts",
    },
  ],
  prerequisites: [
    "Read back the actual Country source publication and selected plane; no release number is assumed",
    "Export the real authoring graph; definition.json is not an authoring graph",
    "Verify baseline preservation and candidate improvement against pinned context; wording alone establishes neither",
    "Keep fixtures in graph.tests, never aliases or runtime examples",
    "An offline rule hash is not custodian agreement, publication or serving evidence",
  ],
};

/** Prepares authoring input only. Human custody and approval come from publication, never this file. */
export function prepareControlledBenchmark(
  graph: MetaEntityGraph,
  key: string,
  declaration: unknown,
) {
  if (!/^[a-z][a-z0-9_.-]{1,126}$/.test(key))
    throw new TypeError("Use a valid published fixture test key");
  if (graph.tests?.some((test) => test.key === key))
    throw new TypeError("Fixture key already exists; use a new versioned key");
  const fixtureSet = validateBenchmarkDeclaration(
    declaration,
    String(graph.entity.entityCode),
  );
  const before = compileGraph(graph);
  const prepared: MetaEntityGraph = {
    ...graph,
    tests: [
      ...(graph.tests ?? []),
      {
        key,
        assertion: "learning_fixture_set",
        path: "entity",
        expected: fixtureSet,
      },
    ],
  };
  const after = compileGraph(prepared);
  if (before.descriptorHash !== after.descriptorHash)
    throw new Error("Benchmark preparation changed runtime meaning");
  if (!runContractTests(prepared).passed)
    throw new Error("Prepared graph fails authoring contract tests");
  return {
    graph: prepared,
    receipt: {
      schema: "atlas-benchmark-preparation/1",
      status: "prepared-only",
      independence: "not-attested",
      entityCode: fixtureSet.entityCode,
      originPlane: fixtureSet.originPlane,
      testKey: key,
      sourceContractHash: before.contractHash,
      preparedContractHash: after.contractHash,
      runtimeDescriptorHash: after.descriptorHash,
      fixtureHash: sha256(fixtureSet.fixtures),
      fixtureCount: fixtureSet.fixtures.length,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === "--init" && args.length === 3) {
    const declaration = JSON.parse(await readFile(args[1], "utf8"));
    if (typeof declaration?.entityCode !== "string")
      throw new TypeError("Missing entity code");
    const fixtureSet = validateBenchmarkDeclaration(
      declaration,
      declaration.entityCode,
    );
    await writePacket(args[2], {
      "declaration.template.json": fixtureSet,
      "attempt-rules.proposed.json": proposedAttemptRules(),
      "handoff.json": {
        ...handoff,
        entityCode: fixtureSet.entityCode,
        originPlane: fixtureSet.originPlane,
        templateHash: sha256(fixtureSet),
        contentStatus: "shared-template-not-independent",
      },
    });
    console.log(
      JSON.stringify({
        status: "template-only",
        independence: "not-attested",
        output: resolve(args[2]),
        fixtureCount: fixtureSet.fixtures.length,
      }),
    );
    return;
  }
  const [graphPath, declarationPath, key, output, flag, rulesPath] = args;
  if (
    !graphPath ||
    !declarationPath ||
    !key ||
    !output ||
    !(
      args.length === 4 ||
      (args.length === 6 && flag === "--rules" && rulesPath)
    )
  )
    throw new Error(
      "Usage: --init <template.json> <new-output-directory> OR <graph.json> <declaration.json> <test-key> <new-output-directory> [--rules <proposed-rules.json>]",
    );
  const declaration = JSON.parse(await readFile(declarationPath, "utf8"));
  const result = prepareControlledBenchmark(
    JSON.parse(await readFile(graphPath, "utf8")),
    key,
    declaration,
  );
  const rules = rulesPath
    ? validateProposedAttemptRules(
        JSON.parse(await readFile(rulesPath, "utf8")),
      )
    : undefined;
  if (rules) {
    const fixtures = validateBenchmarkDeclaration(
      declaration,
      result.receipt.entityCode,
    ).fixtures;
    if (
      rules.minimumCorrectionsImproved >
      fixtures.filter(
        (fixture) =>
          fixture.purpose === "correction" && fixture.expected === "read",
      ).length
    )
      throw new TypeError(
        "Correction threshold exceeds declared correction read fixtures",
      );
  }
  const receipt = {
    ...result.receipt,
    ...(rules
      ? {
          proposedAttemptRulesHash: sha256(rules),
          attemptRulesAgreement: "not-attested",
        }
      : {}),
  };
  await writePacket(output, {
    "graph.json": result.graph,
    "preparation.json": receipt,
    "handoff.json": handoff,
    ...(rules ? { "attempt-rules.proposed.json": rules } : {}),
  });
  console.log(JSON.stringify(receipt));
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  main().catch(() => {
    console.error(
      "Benchmark preparation failed. Check the declaration, source graph, proposed rules, coverage and unused output directory. No release was published.",
    );
    process.exitCode = 1;
  });
