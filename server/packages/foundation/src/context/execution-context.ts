/** Canonical server plane identifiers emitted by Foundation. */
export type PlaneKey = "studio" | "neon" | "mesh";

/** Temporary compatibility input accepted only at process boundaries. */
export type PlaneKeyInput = PlaneKey | "athyper";

/** Converts the retired Athyper logical plane key to its canonical Studio key. */
export function normalizePlaneKey(value: PlaneKeyInput): PlaneKey {
  return value === "athyper" ? "studio" : value;
}

export function isPlaneKeyInput(value: unknown): value is PlaneKeyInput {
  return value === "studio" || value === "neon" || value === "mesh" || value === "athyper";
}

/** Minimal context shared by requests, jobs, and scheduled work. */
export interface ExecutionContext {
  signal?: AbortSignal;
  requestId: string;
  correlationId?: string;
  planeKey?: PlaneKey;
  tenantId?: string;
  principalId?: string;
}
