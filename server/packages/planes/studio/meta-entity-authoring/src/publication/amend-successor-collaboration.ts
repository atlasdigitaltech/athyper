import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import type { SharedReferenceProduct } from "../authoring/product.js";
import { amendSuccessorCapabilities } from "./amend-successor-capabilities.js";

/** Compatibility entry point: the collaboration flag remains collaboration-only. */
export function amendSuccessorCollaboration(graph: MetaEntityGraph, product: SharedReferenceProduct): MetaEntityGraph {
  if (product.definition.capabilities?.some(member => !["comments", "attachments"].includes(member.capabilityKey)))
    throw Error("COLLABORATION_PRODUCT_SOURCE_MISMATCH");
  try { return amendSuccessorCapabilities(graph, product); }
  catch (error) {
    if (error instanceof Error && error.message.startsWith("CAPABILITY_"))
      throw Error(error.message.replace("CAPABILITY_", "COLLABORATION_"));
    throw error;
  }
}
