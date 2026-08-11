// Studio is the control and authoring plane. It owns desired state and publishes
// signed projections; it never writes another plane's database directly.
export * from "@athyper/server-plane-studio-meta-entity-authoring";
export * from "@athyper/server-plane-studio-onboarding";
export * from "@athyper/server-plane-studio-control-authoring";

export const studioPlaneComposition = Object.freeze({
  planeKey: "studio",
  role: "control-authority",
  owns: ["onboarding", "metadata-authoring", "publication", "desired-state"] as const,
  consumes: ["plane-reconciliation-receipts"] as const,
});
