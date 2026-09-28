import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { parseSharedReferenceProduct, type SharedReferenceProduct } from "../authoring/product.js";
import { compileGraph, validateGraph, runContractTests } from "../deterministic.js";

/** Draft-only amendment. Preserve the predecessor's fields, navigation, Summary,
 * operations and authorization; change only explicitly supplied collaboration
 * declarations. This does not approve, qualify or publish the candidate. */
export function amendSuccessorCollaboration(graph: MetaEntityGraph, product: SharedReferenceProduct): MetaEntityGraph {
  const { capabilities, ...definition } = product.definition;
  const validated = parseSharedReferenceProduct({ ...product, definition }, capabilities);
  const requested = validated.definition.capabilities;
  if (graph.entity.entityCode !== definition.entityCode || graph.entity.entityClass !== "reference"
    || graph.entity.ownershipModel !== "system" || !requested?.length
    || requested.some(capability => !["comments", "attachments"].includes(capability.capabilityKey))
    || graph.runtimeProfiles?.length !== 1
    || graph.runtimeProfiles[0]?.storageSchema !== "shared"
    || graph.runtimeProfiles[0]?.storageObject !== definition.storageObject
    || graph.runtimeProfiles[0]?.writeMode !== "none")
    throw Error("COLLABORATION_PRODUCT_SOURCE_MISMATCH");
  const replacements = new Map(requested.map(capability => [capability.capabilityKey, capability]));
  const amendedCapabilities = (graph.capabilities ?? []).map(capability => {
    const replacement = replacements.get(capability.capabilityKey);
    replacements.delete(capability.capabilityKey);
    return structuredClone(replacement ?? capability);
  });
  amendedCapabilities.push(...structuredClone([...replacements.values()]));
  const amended = { ...structuredClone(graph), capabilities: amendedCapabilities };
  const validation = validateGraph(amended), tests = runContractTests(amended);
  if (validation.issues.length || !tests.passed) throw Error("COLLABORATION_GRAPH_VALIDATION_FAILED");
  compileGraph(amended);
  return amended;
}
