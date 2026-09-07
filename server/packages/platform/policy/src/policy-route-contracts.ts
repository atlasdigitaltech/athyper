import { defineRouteContract } from "@athyper/server-runtime-http";

const decision = {
  type: "object",
  required: [
    "action",
    "permitted",
    "outcomes",
    "evaluatedPolicyIds",
    "evaluatedPolicies",
  ],
  properties: {
    action: {
      type: "string",
      enum: ["none", "allow", "deny", "warn", "require_workflow", "escalate"],
    },
    permitted: { type: "boolean" },
    outcomes: { type: "array", items: { type: "object" } },
    winning: { type: "object" },
    evaluatedPolicyIds: { type: "array", items: { type: "string" } },
    evaluatedPolicies: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "versionNo"],
        properties: { id: { type: "string" }, versionNo: { type: "integer" } },
      },
    },
  },
};
const errors = {
  400: { description: "Invalid policy evaluation input" },
  401: { description: "Authentication required" },
  403: { description: "Permission denied" },
  429: { description: "Too many requests" },
  500: { description: "Policy evaluation failed" },
  503: { description: "Authentication or audit authority unavailable" },
};

// Input validation stays in the handlers so permission checks precede field errors.
export const policyEvaluateContract = defineRouteContract({
  method: "post",
  path: "/api/policy/evaluate",
  operationId: "policy.evaluate",
  summary: "Evaluate active policies and record the decision",
  tags: ["Policy"],
  authenticated: true,
  permission: "policy.evaluate",
  responses: {
    ...errors,
    200: { description: "Policy decision", body: decision },
  },
});
export const policySimulateContract = defineRouteContract({
  method: "post",
  path: "/api/policy/simulate",
  operationId: "policy.simulate",
  summary: "Explain active policy evaluation without recording an audit event",
  tags: ["Policy"],
  authenticated: true,
  permission: "policy.simulate",
  responses: {
    ...errors,
    200: {
      description: "Policy simulation",
      body: {
        type: "object",
        required: ["decision", "trace", "effectiveOn", "audited"],
        properties: {
          decision,
          trace: { type: "array", items: { type: "object" } },
          effectiveOn: { type: "string" },
          audited: { const: false },
        },
      },
    },
    501: { description: "Simulation unavailable" },
  },
});
