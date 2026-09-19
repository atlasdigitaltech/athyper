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
export * from "./record-collection-scope.js";
export * from "./business-partner-import.js";
export * from "./business-partner-profile-projection.js";
export * from "./business-partner-profile-projection-routes.js";
export * from "./business-partner-profile-match.js";
export * from "./business-partner-profile-match-routes.js";
export * from "./business-partner-account-bank-linkage.js";
export * from "./business-partner-account-bank-linkage-routes.js";
