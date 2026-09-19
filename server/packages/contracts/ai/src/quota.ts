import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export interface AtlasTenantQuotaPolicy {
  readonly maxRequests: number;
  readonly maxInputTokens: number;
  readonly maxOutputTokens: number;
  readonly windowSeconds: number;
}
export interface AtlasTenantQuotaSnapshot extends AtlasTenantQuotaPolicy {
  readonly tenantId: string;
  readonly usedRequests: number;
  readonly usedInputTokens: number;
  readonly usedOutputTokens: number;
  readonly resetsAt: string;
}
export interface AtlasQuotaReservation { readonly reservationId: string; readonly tenantId: string; readonly planeKey: VerifiedRequestContext["planeKey"]; readonly principalId: string; readonly reservedInputTokens: number; readonly reservedOutputTokens: number }
export interface AtlasTenantQuotaManager {
  reserve(input: { readonly context: VerifiedRequestContext; readonly estimatedInputTokens: number; readonly maxOutputTokens: number }): Promise<AtlasQuotaReservation>;
  settle(input: { readonly reservation: AtlasQuotaReservation; readonly inputTokens: number; readonly outputTokens: number; readonly usageSource?: "provider_final" | "estimated" }): Promise<void>;
  release(reservation: AtlasQuotaReservation): Promise<void>;
  snapshot(context: VerifiedRequestContext): Promise<AtlasTenantQuotaSnapshot>;
  putPolicy(context: VerifiedRequestContext, policy: AtlasTenantQuotaPolicy): Promise<AtlasTenantQuotaSnapshot>;
}
