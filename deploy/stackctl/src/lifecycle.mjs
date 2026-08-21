import { join } from "node:path";
import { runtimeRoot } from "./io.mjs";
import { loadModel } from "./model.mjs";
import { createPlan } from "./plan.mjs";

const OPERATIONS = new Set(["reset", "seed", "test", "destroy"]);

function futureCommand(project, composeFiles, args, environment) {
  return {
    executable: "docker",
    arguments: [
      "compose",
      ...composeFiles.flatMap((path) => ["--file", path]),
      "--project-name",
      project,
      ...args,
    ],
    environment,
    execution: "future-authorized-run-only",
  };
}

export function createLifecyclePlan(repoRoot, instanceId, operation) {
  if (!OPERATIONS.has(operation)) throw new Error(`Unsupported lifecycle operation: ${operation}`);
  const model = loadModel(repoRoot, instanceId);
  const instance = model.instance;
  if (instance.spec.mode !== "qa" || instance.spec.dataPolicy !== "disposable") {
    throw new Error("Lifecycle reset/seed/test/destroy planning is restricted to disposable QA instances.");
  }

  const deployment = createPlan(repoRoot, instanceId);
  const project = instance.spec.composeProject;
  const composeFiles = deployment.sources.compose;
  const imageEnvironment = Object.fromEntries(model.imageSet.spec.images.map(({ id, reference }) => [
    `ATHYPER_IMAGE_${id.replaceAll("-", "_").toUpperCase()}`,
    reference,
  ]));
  const environment = {
    ATHYPER_INSTANCE: instanceId,
    ATHYPER_DOMAIN_SUFFIX: instance.spec.domainSuffix,
    ATHYPER_HTTP_BIND: instance.spec.debugPorts.http,
    ATHYPER_POSTGRES_BIND: instance.spec.debugPorts.postgres,
    ATHYPER_RUNTIME_ROOT: runtimeRoot(),
    ...imageEnvironment,
  };
  const down = futureCommand(project, composeFiles, ["down", "--remove-orphans", "--volumes"], environment);
  const up = futureCommand(project, composeFiles, ["up", "--detach", "--wait"], environment);
  const stages = {
    reset: [
      { id: "capture-dev-fingerprint", effect: "read-only" },
      { id: "verify-qa-ownership-receipt", effect: "read-only" },
      { id: "remove-qa-project", effect: "destructive-qa-only", command: down },
      { id: "create-qa-project", effect: "mutating-qa-only", command: up },
      { id: "verify-dev-fingerprint-unchanged", effect: "read-only" },
    ],
    seed: [
      { id: "verify-qa-ownership-receipt", effect: "read-only" },
      { id: "run-versioned-migrations-and-seed", effect: "mutating-qa-only", execution: "deferred-until-migration-runner-exists" },
    ],
    test: [
      { id: "capture-dev-fingerprint", effect: "read-only" },
      { id: "verify-qa-ownership-receipt", effect: "read-only" },
      { id: "run-qa-contract-and-smoke-suite", effect: "mutating-qa-only", execution: "deferred-until-test-runner-exists" },
      { id: "verify-dev-fingerprint-unchanged", effect: "read-only" },
    ],
    destroy: [
      { id: "capture-dev-fingerprint", effect: "read-only" },
      { id: "verify-qa-ownership-receipt", effect: "read-only" },
      { id: "remove-qa-project", effect: "destructive-qa-only", command: down },
      { id: "verify-dev-fingerprint-unchanged", effect: "read-only" },
    ],
  };

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "LifecyclePlan",
    metadata: { instance: instanceId, operation },
    readOnly: true,
    executionAuthorized: false,
    status: deployment.blockers.length ? "blocked" : "ready-for-explicit-authorization",
    blockers: deployment.blockers,
    isolation: {
      project,
      forbiddenProject: "athyper-dev",
      networkPrefix: `${project}_`,
      volumePrefix: `${project}_`,
      receipt: join(runtimeRoot(), "instances", instanceId, "receipts", "active.json"),
      hostBindings: instance.spec.debugPorts,
      domainSuffix: instance.spec.domainSuffix,
    },
    composeFiles,
    stages: stages[operation],
    actions: ["No action: lifecycle commands are emitted as an unexecuted future-operation contract."],
  };
}
