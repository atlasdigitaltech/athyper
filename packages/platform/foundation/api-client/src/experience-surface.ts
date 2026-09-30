import type { EffectiveExperienceSurface, PersonalSurfaceArrangement } from "@athyper/contract-platform-dashboard";
import { createOperation, encodePathSegment } from "./index";

export const effectiveExperienceSurfaceOperation = createOperation<EffectiveExperienceSurface>({ method: "GET", path: ({ surfaceKey }) => `/platform/experience/surfaces/${encodePathSegment(surfaceKey!)}`, parse: parseEffectiveSurface });
export const savePersonalSurfaceArrangementOperation = createOperation<EffectiveExperienceSurface, PersonalSurfaceArrangement>({ method: "PUT", path: ({ surfaceKey }) => `/platform/experience/surfaces/${encodePathSegment(surfaceKey!)}/arrangement`, parse: parseEffectiveSurface, idempotency: "required" });
export const deletePersonalSurfaceArrangementOperation = createOperation<EffectiveExperienceSurface>({ method: "DELETE", path: ({ surfaceKey }) => `/platform/experience/surfaces/${encodePathSegment(surfaceKey!)}/arrangement`, parse: parseEffectiveSurface, idempotency: "required" });

function parseEffectiveSurface(value: unknown): EffectiveExperienceSurface {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Effective surface response must be an object");
  const root=value as Record<string,unknown>;
  if (!root.surface || typeof root.surface !== "object" || Array.isArray(root.surface) || !root.provenance || typeof root.provenance !== "object" || Array.isArray(root.provenance)) throw new TypeError("Effective surface response is incomplete");
  return value as EffectiveExperienceSurface;
}
