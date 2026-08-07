import type { AtlasPlane } from "../protocol/request";

export interface AtlasCapabilityMetadata {
  id: string;
  label: string;
  icon?: string;
  planes: readonly AtlasPlane[];
}
