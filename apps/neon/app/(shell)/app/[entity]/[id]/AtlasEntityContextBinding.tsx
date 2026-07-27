"use client";

import { useAtlasContextBinding } from "@athyper/atlas-agent-ui";

/**
 * Identifier-only bridge for Atlas. The provider snapshots these identifiers
 * at send time; the server must reload and authorize the record.
 */
export function AtlasEntityContextBinding({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  useAtlasContextBinding({ entityType, entityId });
  return null;
}
