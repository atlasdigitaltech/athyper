import type { VerifiedRequestContext } from "@athyper/svc-iam";
import type { AtlasThreadService } from "./atlas-thread.service.js";

interface AtlasSupportThreadFactory {
  createTenantThread(input: {
    sessionId: string; targetTenantId: string; shadowPrincipalId: string; plane: "admin";
  }): Promise<string>;
}

/**
 * Creates a new private Admin thread from a canonical tenant-local shadow
 * context. The resolver must never manufacture context from request headers.
 */
export class AtlasTenantSupportThreadFactory implements AtlasSupportThreadFactory {
  constructor(
    private readonly threads: AtlasThreadService,
    private readonly resolveShadowContext: (input: {
      targetTenantId: string;
      shadowPrincipalId: string;
    }) => Promise<VerifiedRequestContext>,
  ) {}

  async createTenantThread(input: {
    sessionId: string;
    targetTenantId: string;
    shadowPrincipalId: string;
    plane: "admin";
  }): Promise<string> {
    const context = await this.resolveShadowContext({
      targetTenantId: input.targetTenantId,
      shadowPrincipalId: input.shadowPrincipalId,
    });
    if (
      context.tenantId !== input.targetTenantId
      || context.principalId !== input.shadowPrincipalId
      || context.planeKey !== "admin"
    ) {
      throw new Error("Atlas support shadow context is inconsistent.");
    }
    const thread = await this.threads.createThread(context, {
      title: `Support session ${input.sessionId.slice(0, 8)}`,
    });
    return thread.threadId;
  }
}
