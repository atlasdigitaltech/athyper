// Neon is the enterprise application data plane. It applies signed Studio
// projections locally and remains authoritative for its business records.
export const neonPlaneComposition = Object.freeze({
  planeKey: "neon",
  role: "enterprise-runtime",
  owns: ["enterprise-business-records", "plane-authorization", "plane-audit", "plane-outbox"] as const,
  consumes: ["signed-control-projections", "idempotent-provisioning-commands"] as const,
});

export * from "./register-finance.js";
export * from "./finance-http.js";
export * from "./finance-jobs.js";
