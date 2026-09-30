import assert from "node:assert/strict";
export const run = process.env.BP_AFFORDANCE_RUN ?? "20260912-r3";
assert(
  [
    "20260912",
    "20260912-r2",
    "20260912-r3",
    "20260912-r4",
    "20260912-r5",
  ].includes(run),
  "Unknown qualification run",
);

export const proposalPrefix =
  run === "20260912-r5"
    ? "governance/policy/reviews/business-partner-final-closure-execution-20260912"
    : run === "20260912-r4"
      ? "governance/policy/reviews/business-partner-reveal-coordinates-execution-20260912"
      : run === "20260912-r3"
        ? "governance/policy/reviews/business-partner-summary-context-execution-20260912"
        : `governance/policy/reviews/business-partner-affordance-count-execution-${run}`;
