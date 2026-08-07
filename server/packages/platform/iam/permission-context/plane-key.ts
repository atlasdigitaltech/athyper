// Local PlaneKey re-export to avoid a cross-package import cycle with the
// runtime kernel. The canonical definition lives in server/src/kernel/
// request-context.ts; this file mirrors the shape so the iam package builds
// stand-alone.

export type PlaneKey = "neon" | "mesh" | "admin";

export const PLANE_KEYS = ["neon", "mesh", "admin"] as const satisfies readonly PlaneKey[];

export function isPlaneKey(value: unknown): value is PlaneKey {
  return value === "neon" || value === "mesh" || value === "admin";
}
