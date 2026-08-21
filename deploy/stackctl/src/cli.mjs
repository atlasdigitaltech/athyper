#!/usr/bin/env node
import YAML from "yaml";
import { pathToFileURL } from "node:url";
import { collectDoctor } from "./doctor.mjs";
import { defaultRepoRoot } from "./io.mjs";
import { createPlan, renderConfig } from "./plan.mjs";
import { checkPolicy } from "./policy.mjs";
import { createLifecyclePlan } from "./lifecycle.mjs";
import { createRehearsalPlan } from "./rehearsal.mjs";
import { createCapabilityPlan } from "./capability.mjs";
import { assessOrchestrator } from "./orchestrator.mjs";
import { inspectRemainingGates } from "./gates.mjs";

function usage() {
  return `ATHYPER Stack v2 controller (read-only foundation)\n\nUsage:\n  athyper doctor [--json]\n  athyper config render <instance> [--json]\n  athyper plan <instance> [--json]\n  athyper gates inspect [--json]\n  athyper lifecycle plan <instance> <reset|seed|test|destroy> [--json]\n  athyper rehearsal plan <target> --from <source> [--json]\n  athyper capability plan <instance> <observability|secretstore|analytics|admin-db|admin-queue> [--json]\n  athyper orchestrator assess [--json]\n  athyper policy check [--json]\n`;
}

function print(document, json) {
  process.stdout.write(json ? `${JSON.stringify(document, null, 2)}\n` : YAML.stringify(document, { lineWidth: 120 }));
}

function parse(argv) {
  const args = argv.filter((value) => value !== "--json");
  return { args, json: argv.includes("--json") };
}

export async function main(argv = process.argv.slice(2), repoRoot = defaultRepoRoot) {
  const { args, json } = parse(argv);
  if (args[0] === "doctor" && args.length === 1) {
    const report = collectDoctor(repoRoot);
    print(report, json);
    return report.summary.fail ? 2 : 0;
  }
  if (args[0] === "config" && args[1] === "render" && args[2] && args.length === 3) {
    print(renderConfig(repoRoot, args[2]), json);
    return 0;
  }
  if (args[0] === "plan" && args[1] && args.length === 2) {
    const plan = createPlan(repoRoot, args[1]);
    print(plan, json);
    return plan.blockers.length ? 2 : 0;
  }
  if (args[0] === "lifecycle" && args[1] === "plan" && args[2] && args[3] && args.length === 4) {
    const plan = createLifecyclePlan(repoRoot, args[2], args[3]);
    print(plan, json);
    return plan.blockers.length ? 2 : 0;
  }
  if (args[0] === "rehearsal" && args[1] === "plan" && args[2] && args[3] === "--from" && args[4] && args.length === 5) {
    const plan = createRehearsalPlan(repoRoot, args[2], args[4]);
    print(plan, json);
    return plan.blockers.length ? 2 : 0;
  }
  if (args[0] === "capability" && args[1] === "plan" && args[2] && args[3] && args.length === 4) {
    const plan = createCapabilityPlan(repoRoot, args[2], args[3]);
    print(plan, json);
    return plan.blockers.length ? 2 : 0;
  }
  if (args[0] === "orchestrator" && args[1] === "assess" && args.length === 2) {
    const assessment = assessOrchestrator(repoRoot);
    print(assessment, json);
    return assessment.blockers.length ? 2 : 0;
  }
  if (args[0] === "gates" && args[1] === "inspect" && args.length === 2) {
    const report = inspectRemainingGates(repoRoot);
    print(report, json);
    return report.blockers.length ? 2 : 0;
  }
  if (args[0] === "policy" && args[1] === "check" && args.length === 2) {
    const report = checkPolicy(repoRoot);
    print(report, json);
    return report.errors.length ? 2 : 0;
  }
  process.stderr.write(usage());
  return 64;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`athyper: ${error.message}\n`);
    process.exitCode = 1;
  });
}
