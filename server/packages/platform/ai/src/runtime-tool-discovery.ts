import type { AtlasProviderToolDefinition } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { AtlasResolvedBusinessContext } from "./business-context.js";
import type { AtlasRuntimeToolCoordinator } from "./runtime-tool-coordinator.js";

/** Shared by runtime and evaluation. Inputs must already be server-resolved. */
export async function discoverAtlasRuntimeTools(input: {
  coordinator?: AtlasRuntimeToolCoordinator;
  context: VerifiedRequestContext;
  admission: { readToolsAllowed: boolean; mutationToolsAllowed: boolean };
  toolsEnabled: boolean;
  allowedToolCodes?: readonly string[];
  businessContext?: AtlasResolvedBusinessContext;
}): Promise<readonly AtlasProviderToolDefinition[]> {
  if (!input.coordinator || !input.toolsEnabled ||
      (!input.admission.readToolsAllowed && !input.admission.mutationToolsAllowed) ||
      (input.businessContext?.page.kind === "record" && input.businessContext.page.asOf)) return [];
  return input.coordinator.definitions(input.context, input.admission, input.allowedToolCodes, input.businessContext);
}

export function applicableAtlasRuntimeTools(
  tools: readonly AtlasProviderToolDefinition[],
  businessContext?: AtlasResolvedBusinessContext,
): readonly AtlasProviderToolDefinition[] {
  return tools.filter(tool =>
    (tool.name !== "bp_read_list_insights" || businessContext?.page.kind === "manage") &&
    (!tool.entitySection || !businessContext || tool.entitySection.entityCode === businessContext.page.entityCode));
}
