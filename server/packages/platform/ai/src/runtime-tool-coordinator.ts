import { atlasReadEvidenceHash } from "./message-lineage.js";
import type { AtlasReadReplayEvidence } from "@athyper/server-contract-ai";
import { AtlasServiceError, AtlasScopeSelectionRequiredError } from "./errors.js";
import type { AtlasResolvedBusinessContext } from "./business-context.js";
import type { AtlasProviderToolDefinition, AtlasToolPreview, AtlasToolRunResult } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { hasPermission } from "./context.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";

export interface AtlasRuntimeToolOutcome { readonly preview: AtlasToolPreview; readonly result?: AtlasToolRunResult; readonly replayEvidence?: AtlasReadReplayEvidence }
export interface AtlasRuntimeToolCoordinator {
  definitions(context: VerifiedRequestContext, admission: { readonly readToolsAllowed: boolean; readonly mutationToolsAllowed: boolean }, allowedToolCodes?: readonly string[]): Promise<readonly AtlasProviderToolDefinition[]>;
  handle(input: { readonly businessContext?: AtlasResolvedBusinessContext; readonly context: VerifiedRequestContext; readonly runId: string; readonly threadId: string; readonly callId: string; readonly toolCode: string; readonly arguments: Readonly<Record<string, unknown>>; readonly mutationToolsAllowed: boolean; readonly allowedToolCodes?: readonly string[]; readonly signal?: AbortSignal }): Promise<AtlasRuntimeToolOutcome>;
}

/** Exposes only code-registered manifests; mutations stop at a confirmation-bound preview. */
export class AtlasRegisteredToolCoordinator implements AtlasRuntimeToolCoordinator {
  constructor(private readonly registry: AtlasToolRegistry, private readonly service: AtlasToolService) {}
  async definitions(context: VerifiedRequestContext, admission: { readonly readToolsAllowed: boolean; readonly mutationToolsAllowed: boolean }, allowedToolCodes?: readonly string[]): Promise<readonly AtlasProviderToolDefinition[]> {
    return this.registry.list()
      .filter((tool) => (!allowedToolCodes || allowedToolCodes.includes(tool.manifest.toolCode)) && (tool.manifest.access === "read" ? admission.readToolsAllowed : admission.mutationToolsAllowed) && tool.manifest.allowedPlanes.includes(context.planeKey) && tool.manifest.requiredPermissions.every((permission) => hasPermission(context, permission)))
      .map((tool) => ({ name: tool.manifest.toolCode, description: tool.manifest.description, inputSchema: tool.manifest.inputSchema, ...(tool.entitySection ? {entitySection: tool.entitySection} : {}) }));
  }
  async handle(input: Parameters<AtlasRuntimeToolCoordinator["handle"]>[0]): Promise<AtlasRuntimeToolOutcome> {
    const registration = this.registry.list().find((tool) => tool.manifest.toolCode === input.toolCode);
    if (!registration) throw new Error("Unregistered Atlas tool call.");
    if (input.allowedToolCodes && !input.allowedToolCodes.includes(input.toolCode)) throw new Error("Atlas tool call is outside the selected agent profile.");
    if (registration.manifest.access === "mutation" && !input.mutationToolsAllowed) throw new Error("Mutation Atlas tool call is not admitted.");
    const page=input.businessContext?.page;
    if (registration.manifest.toolCode === "bp_read_list_insights") {
      if (!page || page.kind !== "manage" || page.entityCode !== "business_partner" || Object.keys(input.arguments).some(key => key !== "target")) throw new AtlasServiceError("TOOL_DENIED", "List insights require the current Manage context.");
      input = {...input, arguments: {...input.arguments, page}};
    }
    if (page && registration.entitySection) {
      const ids = page.kind === "record" ? [page.recordId] : page.analysisTarget === "selection" ? page.selectedIds : page.analysisTarget === "visible_page" ? page.visibleIds : undefined;
      if (page.entityCode !== registration.entitySection.entityCode || (ids && !ids.includes(String(input.arguments.recordId)))) throw new AtlasServiceError("TOOL_DENIED", "Section target does not match the current Atlas context.");
    }
    if(page?.kind==="record" && page.asOf)throw new AtlasServiceError("TOOL_DENIED","Current-data tools are unavailable for a historical context.");
    if(page && ["bp_read_summary", "bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"].includes(registration.manifest.toolCode)) {
      const target=input.arguments.recordId;
      const boundIds=page.kind==="record"?[page.recordId]:page.analysisTarget==="selection"?page.selectedIds:page.analysisTarget==="visible_page"?page.visibleIds:undefined;
      if(page.entityCode!=="business_partner" || (boundIds && !boundIds.includes(String(target))))throw new AtlasServiceError("TOOL_DENIED","The tool target does not match the current Atlas context.");
      if(input.arguments.operatingOrganizationId && !page.workContext?.operatingOrganizationId) throw new AtlasScopeSelectionRequiredError();
      if(input.arguments.operatingOrganizationId && input.arguments.operatingOrganizationId!==page.workContext?.operatingOrganizationId)throw new AtlasServiceError("TOOL_DENIED","The tool work context does not match the explicit Atlas work context.");
      if(page.workContext?.operatingOrganizationId)input={...input,arguments:{...input.arguments,operatingOrganizationId:page.workContext.operatingOrganizationId}};
    }
    if (page && ["bp_read_brief", "bp_explain_readiness", "bp_check_eligibility"].includes(registration.manifest.toolCode)) {
      for (const [key, value] of [["companyCodeId", page.workContext?.companyCodeId], ["role", page.kind === "record" ? page.roleLens : undefined]] as const) {
        if (input.arguments[key] && (!value || value === "all")) throw new AtlasScopeSelectionRequiredError();
        if (input.arguments[key] && input.arguments[key] !== value) throw new AtlasServiceError("TOOL_DENIED", "The tool scope does not match the explicit Atlas context.");
        if (value && value !== "all") input = {...input, arguments: {...input.arguments, [key]: value}};
      }
    }
    const governance = registration.manifest.access === "mutation" ? mutationGovernance(input.arguments) : undefined;
    if (page && ["bp_explain_case_validation", "bp_explain_case_diff", "bp_submit_case"].includes(registration.manifest.toolCode)) {
      const caseId = governance?.affectedEntityId ?? input.arguments.caseId;
      if (page.kind !== "record" || page.entityCode !== "business_partner" || !page.caseId || caseId !== page.caseId) throw new AtlasServiceError("TOOL_DENIED", "The case target does not match the current Atlas context.");
    }
    const preview = await this.service.preview({ context: input.context, threadId: input.threadId, runId: input.runId, callId: input.callId, toolCode: registration.manifest.toolCode, toolVersion: registration.manifest.version, arguments: input.arguments, summary: registration.manifest.displayName, ...(governance ?? {}) });
    if (preview.confirmationRequired) return { preview };
    const result = await this.service.run({ context: input.context, proposalId: preview.proposalId, arguments: input.arguments, signal: input.signal });
    const replayEvidence = registration.manifest.access === "read" && result.outcome === "completed" && !result.replayed ? {
      toolCode: registration.manifest.toolCode, toolVersion: registration.manifest.version,
      arguments: input.arguments, policyRevision: preview.policyRevision,
      resultHash: atlasReadEvidenceHash(registration.manifest.toolCode, { data: result.data, sources: result.sources }),
    } : undefined;
    return { preview, result, ...(replayEvidence ? { replayEvidence } : {}) };
  }
}

function mutationGovernance(argumentsValue: Readonly<Record<string, unknown>>): { readonly affectedEntityType?: string; readonly affectedEntityId?: string; readonly expectedRowVersion?: number } {
  const envelope = argumentsValue.governance && typeof argumentsValue.governance === "object" && !Array.isArray(argumentsValue.governance) ? argumentsValue.governance as Readonly<Record<string, unknown>> : argumentsValue;
  return {
    ...(typeof envelope.affectedEntityType === "string" ? { affectedEntityType: envelope.affectedEntityType } : {}),
    ...(typeof envelope.affectedEntityId === "string" ? { affectedEntityId: envelope.affectedEntityId } : {}),
    ...(Number.isSafeInteger(envelope.expectedRowVersion) && Number(envelope.expectedRowVersion) >= 0 ? { expectedRowVersion: Number(envelope.expectedRowVersion) } : {}),
  };
}
