import { createPermissionAuthorizer } from "./permission-authorizer.js";
import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";

export interface IdentityReplayApproval {
  readonly id: string;
  readonly authorityTenantId: string;
  readonly attemptId: string;
  readonly desiredVersion: string;
  readonly desiredHash: string;
  readonly requestedBy: string;
  readonly reason: string;
  readonly status: "pending" | "approved" | "revoked" | "consumed";
  readonly expiresAt: string;
  readonly approvedBy: string | null;
}
export class IdentityReplayError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 503,
    readonly code: string,
  ) {
    super(code);
  }
}
export interface IdentityReplayApprovalRepository {
  create(
    context: VerifiedRequestContext,
    input: { attemptId: string; reason: string; ttlSeconds: number },
  ): Promise<IdentityReplayApproval>;
  read(
    context: VerifiedRequestContext,
    approvalId: string,
  ): Promise<IdentityReplayApproval>;
  decide(
    context: VerifiedRequestContext,
    input: {
      approvalId: string;
      decision: "approve" | "revoke";
      reason: string;
    },
  ): Promise<IdentityReplayApproval>;
  consume(
    context: VerifiedRequestContext,
    input: { attemptId: string; approvalId: string },
  ): Promise<void>;
}
export class IdentityReplayApprovalService {
  constructor(
    private readonly repository: IdentityReplayApprovalRepository,
    private readonly authorizer: Authorizer,
    private readonly enabled = false,
  ) {}
  private async authorize(
    context: VerifiedRequestContext,
    resource: Record<string, unknown>,
    write = true,
  ): Promise<void> {
    if (context.planeKey !== "studio")
      throw new IdentityReplayError(403, "IAM_REPLAY_FORBIDDEN");
    if (write && context.assurance !== "elevated")
      throw new IdentityReplayError(403, "IAM_REPLAY_MFA_REQUIRED");
    const decision = await this.authorizer.authorize({
      context,
      permissionCode: `studio.iam.application_projection.${write ? "replay" : "read"}`,
      resource: {
        ...resource,
        identityReplayGoverned: true,
        tenantId: context.tenantId,
      },
    });
    if (!decision.allowed)
      throw new IdentityReplayError(403, "IAM_REPLAY_FORBIDDEN");
  }
  async create(
    context: VerifiedRequestContext,
    input: { attemptId: string; reason: string; ttlSeconds?: number },
  ): Promise<IdentityReplayApproval> {
    await this.authorize(context, { attemptId: input.attemptId });
    const reason = input.reason.trim();
    const ttlSeconds = input.ttlSeconds ?? 900;
    if (
      !reason ||
      Array.from(reason).length > 1000 ||
      reason.includes("\0") ||
      !Number.isInteger(ttlSeconds) ||
      ttlSeconds < 60 ||
      ttlSeconds > 3600
    )
      throw new IdentityReplayError(400, "IAM_REPLAY_APPROVAL_INVALID");
    return this.repository.create(context, { ...input, reason, ttlSeconds });
  }
  async read(
    context: VerifiedRequestContext,
    approvalId: string,
  ): Promise<IdentityReplayApproval> {
    await this.authorize(context, { approvalId }, false);
    return this.repository.read(context, approvalId);
  }
  async decide(
    context: VerifiedRequestContext,
    input: {
      approvalId: string;
      decision: "approve" | "revoke";
      reason: string;
    },
  ): Promise<IdentityReplayApproval> {
    await this.authorize(context, { approvalId: input.approvalId });
    const reason = input.reason.trim();
    if (!reason || Array.from(reason).length > 1000 || reason.includes("\0"))
      throw new IdentityReplayError(400, "IAM_REPLAY_APPROVAL_INVALID");
    return this.repository.decide(context, { ...input, reason });
  }
  async replay(
    context: VerifiedRequestContext,
    input: { attemptId: string; approvalId: string },
  ): Promise<void> {
    await this.authorize(context, input);
    if (!this.enabled)
      throw new IdentityReplayError(503, "IAM_REPLAY_DISABLED");
    await this.repository.consume(context, input);
  }
}

/** Used only by commands that enforce maker-checker state in the durable repository. */
export function createIdentityReplayAuthorizer(): Authorizer {
  return createPermissionAuthorizer({
    policyGate: {
      async evaluate(input) {
        const governed = input.resource?.["identityReplayGoverned"] === true;
        return { allowed: governed, sodSatisfied: governed };
      },
    },
  });
}
