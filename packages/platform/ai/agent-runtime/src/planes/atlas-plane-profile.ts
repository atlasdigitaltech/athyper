import type { AtlasPlane } from "../protocol/request";

export interface AtlasPlaneProfile {
  plane: AtlasPlane;
  title: string;
  description: string;
  emptyState: string;
  suggestions: readonly string[];
  capabilityIds: readonly string[];
}
