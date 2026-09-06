// Mesh is the partner-network and exchange data plane. It applies signed
// Studio projections locally and remains authoritative for network records.
export const meshPlaneComposition = Object.freeze({
  planeKey: "mesh",
  role: "network-runtime",
  owns: ["network-accounts", "relationships", "exchange-envelopes", "plane-authorization", "plane-audit", "plane-outbox"] as const,
  consumes: ["signed-control-projections", "idempotent-provisioning-commands"] as const,
});

export * from "./record-collection-scope.js";
export * from "./network-relationship-import.js";
export * from "./business-partner-profile-publication.js";
export * from "./business-partner-profile-publication-routes.js";
export * from "./business-partner-bank-disclosure.js";
export * from "./business-partner-bank-disclosure-routes.js";
export * from "./business-partner-delivery.js";
export * from "./business-partner-network-exchange.js";
export * from "./business-partner-network-exchange-routes.js";
export * from "./business-partner-self-registration-policy.js";
