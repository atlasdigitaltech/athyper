import type { AtlasProviderToolDefinition, AtlasToolPreview, AtlasToolRunResult } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { hasPermission } from "./context.js";
import { AtlasToolRegistry, AtlasToolService } from "./tool-service.js";

export interface AtlasRuntimeToolOutcome { readonly preview: AtlasToolPreview; readonly result?: AtlasToolRunResult }
export interface AtlasRuntimeToolCoordinator {
  definitions(context: VerifiedRequestContext): Promise<readonly AtlasProviderToolDefinition[]>;
  handle(input: { readonly context: VerifiedRequestContext; readonly runId: string; readonly threadId: string; readonly callId: string; readonly toolCode: string; readonly arguments: Readonly<Record<string, unknown>>; readonly signal?: AbortSignal }): Promise<AtlasRuntimeToolOutcome>;
}

/** Exposes only code-registered manifests; mutations stop at a confirmation-bound preview. */
export class AtlasRegisteredToolCoordinator implements AtlasRuntimeToolCoordinator {
  constructor(private readonly registry: AtlasToolRegistry, private readonly service: AtlasToolService) {}
  async definitions(context: VerifiedRequestContext): Promise<readonly AtlasProviderToolDefinition[]> {
    return this.registry.list()
      .filter((tool) => tool.manifest.allowedPlanes.includes(context.planeKey) && tool.manifest.requiredPermissions.every((permission) => hasPermission(context, permission)))
      .map((tool) => ({ name: tool.manifest.toolCode, description: tool.manifest.description, inputSchema: tool.manifest.inputSchema }));
  }
  async handle(input: Parameters<AtlasRuntimeToolCoordinator["handle"]>[0]): Promise<AtlasRuntimeToolOutcome> {
    const registration = this.registry.list().find((tool) => tool.manifest.toolCode === input.toolCode);
    if (!registration) throw new Error("Unregistered Atlas tool call.");
    const preview = await this.service.preview({ context: input.context, threadId: input.threadId, runId: input.runId, callId: input.callId, toolCode: registration.manifest.toolCode, toolVersion: registration.manifest.version, arguments: input.arguments, summary: registration.manifest.displayName });
    if (preview.confirmationRequired) return { preview };
    const result = await this.service.run({ context: input.context, proposalId: preview.proposalId, arguments: input.arguments, signal: input.signal });
    return { preview, result };
  }
}
