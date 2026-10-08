import type { ReactNode } from "react";
import {
  parseDetailFieldRenderer,
  type EntitySurfaceFieldV1,
} from "@athyper/contract-platform-entity-runtime";

/** Receives authorized/formatted content; references retain their standard link. */
export function renderDetailFieldValue(
  field: EntitySurfaceFieldV1,
  content: ReactNode,
): ReactNode {
  if (field.rendererKey !== undefined)
    parseDetailFieldRenderer(field.rendererKey, field.kind);
  return content;
}
