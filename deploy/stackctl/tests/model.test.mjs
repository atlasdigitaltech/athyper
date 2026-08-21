import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import YAML from "yaml";
import { defaultRepoRoot } from "../src/io.mjs";
import { loadModel } from "../src/model.mjs";
import { createPlan, renderConfig } from "../src/plan.mjs";
import { createLifecyclePlan } from "../src/lifecycle.mjs";
import { createRehearsalPlan } from "../src/rehearsal.mjs";
import { createCapabilityPlan } from "../src/capability.mjs";
import { assessOrchestrator } from "../src/orchestrator.mjs";
import { inspectRemainingGates } from "../src/gates.mjs";
import { checkPolicy } from "../src/policy.mjs";
import { createValidator } from "../src/schema.mjs";

test("catalog accounts for all 39 resolved Stack v1 services", () => {
  const model = loadModel(defaultRepoRoot, "dev");
  assert.equal(model.services.filter((service) => service.ledger === "resolved-v1").length, 39);
  assert.equal(model.services.filter((service) => service.ledger === "test-fixture").length, 1);
  assert.equal(model.services.filter((service) => service.ledger === "v2-addition").length, 5);
});

test("DEV render is project-scoped and uses the laptop-32 envelope", () => {
  const rendered = renderConfig(defaultRepoRoot, "dev");
  assert.equal(rendered.spec.composeProject, "athyper-dev");
  assert.equal(rendered.spec.hostProfile, "laptop-32");
  assert.equal(rendered.spec.domainSuffix, "dev.athyper.test");
  assert.ok(rendered.spec.services.length > 0);
});

test("DEV plan is bounded and names only project-scoped resources", () => {
  const plan = createPlan(defaultRepoRoot, "dev", {
    infrastructureGates: {
      blockers: [],
      qualification: { path: "/qualification/phase-status.yaml" },
      cold: { path: "/qualification/cold-start.json" },
      disposition: { path: "/qualification/disposition.json" },
      intake: { path: "/qualification/export-intake.json" },
      restore: { path: "/qualification/restore-receipt.json" },
    },
    policy: { errors: [] },
    runtimeRoot: "/runtime/fixture",
    secretProblem: () => null,
    listeningPorts: () => new Set([5432]),
    liveProjectObjects: () => ({ containers: ["fixture-container"], networks: [], volumes: [] }),
  });
  assert.ok(plan.resources.memoryMiB <= plan.resources.limitMemoryMiB);
  assert.ok(plan.resources.cpu <= plan.resources.limitCpu);
  assert.ok(plan.networks.every((name) => name.startsWith("athyper-dev_")));
  assert.ok(plan.volumes.every((name) => name.startsWith("athyper-dev_")));
  assert.equal(plan.platform.project, "athyper-platform");
  assert.equal(plan.platform.gatewayAlias, "gateway-dev");
  assert.deepEqual(plan.actions, ["No action: this command only validates and reports."]);
  assert.equal(plan.status, "blocked");
  assert.ok(plan.blockers.some((message) => message.includes("already listening")));
  assert.ok(plan.blockers.some((message) => message.includes("already owns Docker resources")));
  assert.ok(!plan.blockers.some((message) => message.startsWith("Host qualification gate incomplete:")));
  assert.ok(!plan.blockers.some((message) => message.startsWith("Required secret file is absent:")));
  assert.equal(plan.deferredPreflights.length, 4);
});

test("DEV plan accepts live resources owned by its valid controller receipt", () => {
  const plan = createPlan(defaultRepoRoot, "dev", {
    infrastructureGates: {
      blockers: [],
      qualification: { path: "/qualification/phase-status.yaml" },
      cold: { path: "/qualification/cold-start.json" },
      disposition: { path: "/qualification/disposition.json" },
      intake: { path: "/qualification/export-intake.json" },
      restore: { path: "/qualification/restore-receipt.json" },
    },
    policy: { errors: [] },
    runtimeRoot: "/runtime/fixture",
    secretProblem: () => null,
    listeningPorts: () => new Set(),
    liveProjectObjects: () => ({ containers: ["fixture-container"], networks: ["fixture-network"], volumes: [] }),
    projectOwnership: { owned: true, path: "/runtime/fixture/instances/dev/receipts/active.json", state: "running" },
  });
  assert.equal(plan.status, "ready");
  assert.equal(plan.ownershipReceipt.owned, true);
  assert.ok(!plan.blockers.some((message) => message.includes("already owns Docker resources")));
});

test("remaining-gate inspection is read-only and evidence-backed", () => {
  const cleanSlate = { path: "/qualification/disposition.json", document: { decision: "clean-slate" }, problem: null };
  const report = inspectRemainingGates(defaultRepoRoot, {
    qualification: { path: "/qualification/phase-status.yaml", failures: [] },
    cold: { path: "/qualification/cold-start.json", document: {}, problem: null },
    disposition: cleanSlate,
    intake: { path: "/qualification/export-intake.json", document: null, problem: "fixture absent" },
    restore: { path: "/qualification/restore-receipt.json", document: null, problem: "fixture absent" },
    devPlan: { blockers: [], requiredSecrets: [], sources: { imageSet: "/images/dev.yaml" } },
    qaPlan: {
      blockers: ["Release image set is incomplete: fixture is absent."],
      requiredSecrets: [],
      sources: { imageSet: "/images/qa.yaml" },
    },
  });
  assert.equal(report.readOnly, true);
  assert.equal(report.executionAuthorized, false);
  assert.equal(report.status, "blocked");
  assert.equal(report.gates.machinePhaseStatus.status, "pass");
  assert.equal(report.gates.coldStart.status, "pass");
  assert.equal(report.gates.stackV1Disposition.status, "pass");
  assert.equal(report.gates.stackV1ExportIntake.status, "waived-clean-slate");
  assert.equal(report.gates.stackV1Restore.status, "waived-clean-slate");
  assert.equal(report.gates.devSecrets.status, "pass");
  assert.equal(report.gates.immutableImages.status, "blocked");
  assert.deepEqual(report.actions, ["No action: this command only validates and reports remaining gates."]);
});

test("DEV core Compose is isolated and contains the Phase 6 dependency spine", () => {
  const report = checkPolicy(defaultRepoRoot);
  assert.deepEqual(report.errors, []);
});

test("DEV-full parity is bounded and includes every Phase 8 service", () => {
  const plan = createPlan(defaultRepoRoot, "dev");
  assert.equal(plan.preset, "dev-full");
  assert.equal(plan.resources.memoryMiB, 13_312);
  assert.equal(plan.resources.cpu, 15.95);
  assert.ok(plan.services.some((service) => service.id === "db-migration"));
  assert.equal(plan.sources.compose.length, 2);
  assert.ok(plan.domains.includes("mail.dev.athyper.test"));
  for (const id of [
    "api", "worker", "scheduler", "neon-web", "mesh-web", "studio-web",
    "virusscan", "docrender", "docparser", "searchcore", "mailtrap",
  ]) {
    assert.ok(plan.services.some((service) => service.id === id), `${id} is absent`);
  }
});

test("QA plan is independently addressed and rejects placeholder candidate images", () => {
  const plan = createPlan(defaultRepoRoot, "qa");
  assert.equal(plan.project, "athyper-qa");
  assert.equal(plan.preset, "qa-standard");
  assert.equal(plan.sources.compose.length, 2);
  assert.deepEqual(plan.debugPorts, { postgres: "127.0.0.1:55432" });
  assert.deepEqual(plan.platform.ingressPorts, ["127.0.0.1:80", "127.0.0.1:443"]);
  assert.ok(plan.networks.every((name) => name.startsWith("athyper-qa_")));
  assert.ok(plan.volumes.every((name) => name.startsWith("athyper-qa_")));
  assert.ok(plan.domains.every((name) => name.endsWith(".qa.athyper.test")));
  assert.ok(plan.blockers.some((message) => message.includes("image set is incomplete")));
  assert.ok(plan.blockers.some((message) => message.includes("source revision is an all-zero placeholder")));
  assert.ok(plan.blockers.some((message) => message.includes("digest is an all-zero placeholder")));
  assert.match(
    plan.services.find(({ id }) => id === "api").image,
    /athyper-runtime-server@sha256:0{64}$/u,
  );
});

test("QA lifecycle plans are read-only and cannot target DEV", () => {
  for (const operation of ["reset", "seed", "test", "destroy"]) {
    const plan = createLifecyclePlan(defaultRepoRoot, "qa", operation);
    assert.equal(plan.readOnly, true);
    assert.equal(plan.executionAuthorized, false);
    assert.equal(plan.isolation.project, "athyper-qa");
    assert.equal(plan.isolation.forbiddenProject, "athyper-dev");
    assert.match(plan.isolation.receipt, /instances\/qa\/receipts\/active\.json$/u);
    assert.deepEqual(plan.actions, ["No action: lifecycle commands are emitted as an unexecuted future-operation contract."]);
    for (const stage of plan.stages) {
      if (!stage.command) continue;
      assert.ok(stage.command.arguments.includes("athyper-qa"));
      assert.ok(!stage.command.arguments.includes("athyper-dev"));
      assert.equal(stage.command.environment.ATHYPER_INSTANCE, "qa");
      assert.equal(stage.command.environment.ATHYPER_HTTP_BIND, undefined);
      assert.equal(stage.command.environment.ATHYPER_POSTGRES_BIND, "127.0.0.1:55432");
      assert.match(stage.command.environment.ATHYPER_IMAGE_RUNTIME_SERVER, /@sha256:0{64}$/u);
    }
  }
  assert.throws(
    () => createLifecyclePlan(defaultRepoRoot, "dev", "destroy"),
    /restricted to disposable QA instances/u,
  );
});

test("QA routing and Compose environment defaults cannot inherit DEV identity", () => {
  const qaRoutes = readFileSync(join(
    defaultRepoRoot,
    "deploy/compose/instance/config/traefik/qa.yaml",
  ), "utf8");
  const parity = readFileSync(join(
    defaultRepoRoot,
    "deploy/compose/instance/compose.parity.yaml",
  ), "utf8");
  assert.match(qaRoutes, /iam\.qa\.athyper\.test/u);
  assert.doesNotMatch(qaRoutes, /\.dev\.athyper\.test/u);
  assert.match(parity, /ATHYPER_IMAGE_RUNTIME_SERVER/u);
  assert.match(parity, /ATHYPER_IMAGE_NEON_WEB/u);
  assert.match(parity, /ATHYPER_DOMAIN_SUFFIX/u);
  assert.doesNotMatch(parity, /ATHYPER_APP_DOMAIN: .*\.dev\.athyper\.test/u);
});

test("STG rehearsal is digest-preserving, sanitized, backup-first, and read-only", () => {
  const plan = createRehearsalPlan(defaultRepoRoot, "stg", "qa");
  assert.equal(plan.readOnly, true);
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.status, "blocked");
  assert.equal(plan.promotion.rebuildAllowed, false);
  assert.equal(plan.promotion.images.length, 5);
  assert.equal(plan.promotion.exactDigestMatch, false);
  assert.equal(plan.dataPolicy.classification, "sanitized");
  assert.ok(plan.dataPolicy.prohibitedContent.includes("credentials"));
  assert.equal(plan.integrationPolicy.defaultAction, "deny");
  assert.equal(plan.integrationPolicy.productionCredentialsAllowed, false);
  assert.deepEqual(plan.integrationPolicy.allowedDestinations, []);
  assert.equal(plan.isolation.project, "athyper-stg");
  assert.deepEqual(plan.isolation.protectedProjects, ["athyper-dev", "athyper-qa"]);
  assert.deepEqual(plan.isolation.hostBindings, { postgres: "127.0.0.1:56432" });
  assert.ok(plan.blockers.some((message) => message.includes("Promotion digest mismatch or absence")));
  assert.ok(plan.blockers.some((message) => message.includes("sanitizedDataManifest")));
  const stageIds = plan.stages.map(({ id }) => id);
  assert.ok(stageIds.indexOf("capture-pre-migration-backup") < stageIds.indexOf("run-stg-migration"));
  assert.ok(stageIds.indexOf("run-stg-migration") < stageIds.indexOf("restore-backup-into-disposable-target"));
  assert.deepEqual(plan.actions, ["No action: this command only validates and emits the STG rehearsal contract."]);
  assert.throws(
    () => createRehearsalPlan(defaultRepoRoot, "stg", "dev"),
    /permits only qa -> stg/u,
  );
});

test("STG routes expose no DEV, QA, or mail-capture identity", () => {
  const routes = readFileSync(join(
    defaultRepoRoot,
    "deploy/compose/instance/config/traefik/stg.yaml",
  ), "utf8");
  assert.match(routes, /iam\.stg\.athyper\.test/u);
  assert.doesNotMatch(routes, /\.(dev|qa)\.athyper\.test/u);
  assert.doesNotMatch(routes, /mailtrap|mail\.stg/u);
});

test("optional capability plans are profile-scoped, bounded, and read-only", () => {
  const expected = {
    observability: { services: 6, memoryMiB: 2_368, cpu: 2.6, port: "127.0.0.1:53000" },
    secretstore: { services: 2, memoryMiB: 896, cpu: 1.25, port: "127.0.0.1:53001" },
    analytics: { services: 2, memoryMiB: 1_152, cpu: 1.25, port: "127.0.0.1:53002" },
    "admin-db": { services: 1, memoryMiB: 128, cpu: 0.25, port: "127.0.0.1:53003" },
    "admin-queue": { services: 2, memoryMiB: 768, cpu: 0.75, port: "127.0.0.1:53004" },
  };
  for (const [profile, contract] of Object.entries(expected)) {
    const plan = createCapabilityPlan(defaultRepoRoot, "dev", profile);
    assert.equal(plan.readOnly, true);
    assert.equal(plan.executionAuthorized, false);
    assert.deepEqual(plan.composeProfiles, [profile]);
    assert.equal(plan.composeFiles.length, 3);
    assert.equal(plan.services.length, contract.services);
    assert.equal(plan.resources.additionalMemoryMiB, contract.memoryMiB);
    assert.equal(plan.resources.additionalCpu, contract.cpu);
    assert.ok(Object.values(plan.bindings).includes(contract.port));
    assert.deepEqual(plan.actions, ["No action: this command only validates an optional capability profile."]);
  }
  const observability = createCapabilityPlan(defaultRepoRoot, "dev", "observability");
  assert.ok(observability.blockers.some((message) => message.includes("host profile permits")));
  assert.throws(
    () => createCapabilityPlan(defaultRepoRoot, "dev", "unknown"),
    /Unsupported optional capability profile/u,
  );
});

test("K3s remains deferred until runtime acceptance and approved multi-host need", () => {
  const assessment = assessOrchestrator(defaultRepoRoot, {
    qualificationPath: "/qualification/fixture/missing-machine.yaml",
    qualificationRoot: "/qualification/fixture",
    exists: () => false,
  });
  assert.equal(assessment.readOnly, true);
  assert.equal(assessment.executionAuthorized, false);
  assert.equal(assessment.status, "deferred");
  assert.equal(assessment.recommendation, "Keep Docker Compose as the active single-host orchestrator.");
  assert.equal(assessment.policy.currentOrchestrator, "compose");
  assert.equal(assessment.policy.candidateOrchestrator, "k3s");
  assert.equal(assessment.policy.laptopK3sAllowed, false);
  assert.equal(assessment.policy.dockerDesktopKubernetesAllowed, false);
  assert.equal(assessment.policy.automaticMigrationAllowed, false);
  assert.ok(assessment.blockers.some((message) => message.includes("Machine phase evidence is absent")));
  assert.ok(assessment.blockers.some((message) => message.includes("Compose acceptance evidence is absent")));
  assert.ok(assessment.blockers.some((message) => message.includes("Approved multi-host topology requirement evidence is absent")));
  assert.ok(assessment.prohibitedOutputsWhileDeferred.includes("K3s installation"));
  assert.deepEqual(assessment.actions, ["No action: this command only assesses the Compose-to-K3s decision gate."]);
});

test("v2 schemas and static policies pass", () => {
  const report = checkPolicy(defaultRepoRoot);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.validatedInstances, ["dev", "qa", "stg"]);
});

test("deliberately invalid instance fixtures fail schema validation", () => {
  const validate = createValidator(defaultRepoRoot);
  const invalid = structuredClone(loadModel(defaultRepoRoot, "dev").instance);
  invalid.metadata.id = "DEV_INVALID";
  invalid.spec.composeProject = "fixed-global-name";
  invalid.spec.debugPorts.postgres = "0.0.0.0:5432";
  assert.throws(() => validate(invalid, "invalid-instance-fixture"), /must match pattern/u);
  assert.throws(() => validate({
    apiVersion: "athyper.io/v1alpha1",
    kind: "PreMigrationBackupReceipt",
    metadata: { instance: "stg" },
    spec: {
      createdAt: "2026-08-21T00:00:00Z",
      sourceRevision: "0".repeat(40),
      database: { sha256: "0".repeat(64), sizeBytes: 0, format: "postgres-custom" },
    },
  }, "placeholder-backup-receipt"), /must match pattern|must be >= 1/u);
  assert.throws(() => validate({
    apiVersion: "athyper.io/v1alpha1",
    kind: "TopologyRequirement",
    metadata: { id: "laptop", approvedBy: "operator", approvedAt: "2026-08-21T00:00:00Z" },
    spec: { multiHostRequired: false, minimumNodeCount: 1, placementRequirements: [], approved: false },
  }, "unapproved-single-host-topology"), /must be equal to constant|must be >= 2|must NOT have fewer than 1 items/u);
});

test("container publication is manual, scan-before-push, and attestable", () => {
  const workflow = YAML.parse(readFileSync(
    join(defaultRepoRoot, ".github/workflows/stack-v2-images.yml"),
    "utf8",
  ));
  assert.deepEqual(Object.keys(workflow.on), ["workflow_dispatch"]);
  assert.equal(workflow.permissions.contents, "read");
  assert.deepEqual(
    workflow.jobs.publish.strategy.matrix.include.map(({ id }) => id).sort(),
    ["iam", "mesh-web", "neon-web", "runtime-server", "studio-web"],
  );
  const steps = workflow.jobs.publish.steps;
  const scanIndex = steps.findIndex(({ name }) => name === "Enforce vulnerability gate");
  const pushIndex = steps.findIndex(({ name }) => name === "Publish image with BuildKit SBOM and provenance");
  assert.ok(scanIndex >= 0 && pushIndex > scanIndex);
  const publish = steps[pushIndex].with;
  assert.equal(publish.push, true);
  assert.equal(publish.sbom, true);
  assert.equal(publish.provenance, "mode=max");
  const metadata = steps.find(({ name }) => name === "Generate OCI metadata");
  assert.doesNotMatch(metadata.with.tags, /type=raw/u);
  assert.match(metadata.with.tags, /type=sha/u);
  assert.ok(steps.some(({ uses }) => uses?.startsWith("actions/attest-build-provenance@")));
  for (const { uses } of steps) {
    if (uses) assert.match(uses, /@[a-f0-9]{40}$/u);
  }
});

test("every external base for a published image is digest-pinned", () => {
  const targets = [
    "apps/Dockerfile",
    "server/Dockerfile.prod",
    "stack/config/iam/Dockerfile",
  ];
  for (const target of targets) {
    const text = readFileSync(join(defaultRepoRoot, target), "utf8");
    const externalBases = [...text.matchAll(/^FROM\s+(\S*:\S+)/gmu)].map((match) => match[1]);
    assert.ok(externalBases.length > 0, `${target} has no external base`);
    for (const image of externalBases) {
      assert.match(image, /@sha256:[a-f0-9]{64}$/u, `${target}: ${image} is mutable`);
    }
  }
});

test("Keycloak optimized builds retain every recorded runtime dependency", () => {
  const dockerfile = readFileSync(join(defaultRepoRoot, "stack/config/iam/Dockerfile"), "utf8");
  assert.match(dockerfile, /kc\.sh build --db=postgres/u);
  assert.doesNotMatch(dockerfile, /rm\s+-f[\s\S]*mssql-jdbc/u);
});

test("DEV browser secrets and proxied realms use deployable formats", () => {
  const bootstrap = readFileSync(join(defaultRepoRoot, "deploy/bootstrap/generate-dev-secrets.sh"), "utf8");
  assert.match(bootstrap, /openssl rand -base64 32/u);
  assert.doesNotMatch(bootstrap, /random_hex > "\$staging\/session-token-encryption-key"/u);
  for (const realm of ["realm-platform-control.json", "realm-platform-control-clean-slate.json"]) {
    const document = JSON.parse(readFileSync(join(defaultRepoRoot, "stack/config/iam", realm), "utf8"));
    assert.equal(document.sslRequired, "external");
  }
});
