"use client";

import { useEffect } from "react";
import { useOptionalAtlas } from "./atlas-context";
import {
  normalizeAtlasContextBinding,
  type AtlasContextBinding,
} from "./atlas-context-binding";

/**
 * Registers identifiers only. Record data, page text, form state, metadata,
 * and authorization scope never cross this client boundary.
 */
export function useAtlasContextBinding(binding: AtlasContextBinding): void {
  const atlas = useOptionalAtlas();
  const entityType = binding.entityType;
  const entityId = binding.entityId;
  const registerContextBinding = atlas?.registerContextBinding;

  useEffect(() => {
    if (!registerContextBinding) return;
    const normalized = normalizeAtlasContextBinding({ entityType, entityId });
    return registerContextBinding(normalized);
  }, [entityId, entityType, registerContextBinding]);
}
