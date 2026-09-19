import { inspectInfrastructureGates } from "./infrastructure-gates.mjs";
import { createPlan } from "./plan.mjs";

export function inspectRemainingGates(repoRoot, probes = {}) {
  const infrastructure = probes.infrastructure ?? inspectInfrastructureGates(repoRoot, probes);
  const planProbes = { infrastructureGates: infrastructure };
  const devPlan = probes.devPlan ?? createPlan(repoRoot, "dev", planProbes);
  const qaPlan = probes.qaPlan ?? createPlan(repoRoot, "qa", planProbes);
  const secretProblems = devPlan.blockers.filter((problem) => problem.startsWith("Required secret file"));
  const imageProblems = qaPlan.blockers.filter((problem) => /image set|image digest|image is mutable|source revision/iu.test(problem));
  const blockers = [
    ...infrastructure.blockers,
    ...secretProblems,
    ...imageProblems,
  ];

  return {
    apiVersion: "athyper.io/v1alpha1",
    kind: "RemainingGateReport",
    generatedAt: new Date().toISOString(),
    readOnly: true,
    executionAuthorized: false,
    status: blockers.length === 0 ? "ready-for-explicit-runtime-authorization" : "blocked",
    gates: {
      ...infrastructure.gates,
      devSecrets: { status: secretProblems.length === 0 ? "pass" : "blocked", evidence: devPlan.requiredSecrets, problems: secretProblems },
      immutableImages: { status: imageProblems.length === 0 ? "pass" : "blocked", evidence: qaPlan.sources.imageSet, problems: imageProblems },
    },
    blockers,
    externalAuthorizations: [
      ...(infrastructure.cleanSlate ? [] : ["Old-workstation export execution and encrypted transfer remain operator actions."]),
      "Secret generation requires explicit operator execution after disposition and host gates pass.",
      "Staging, committing, pushing, and image-workflow dispatch require explicit authorization.",
    ],
    actions: ["No action: this command only validates and reports remaining gates."],
  };
}
