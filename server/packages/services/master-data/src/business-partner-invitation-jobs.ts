import type { JobHandler } from "@athyper/server-contract-jobs";
import type { BusinessPartnerInvitationService } from "@athyper/server-contract-master-data";
export const BUSINESS_PARTNER_INVITATION_MAINTENANCE_QUEUE = "neon-business-partner-invitation-maintenance";
export const EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB = "business-partner-invitations-expire";
export interface BusinessPartnerInvitationExpiryPayload { readonly tenantId: string; readonly actorId: string; readonly limit?: number; readonly now?: string }
export function createBusinessPartnerInvitationExpiryHandler(service: BusinessPartnerInvitationService): JobHandler<typeof EXPIRE_BUSINESS_PARTNER_INVITATIONS_JOB,BusinessPartnerInvitationExpiryPayload> { return { async handle(job,context) { if (context.signal.aborted) return { status: "discarded", reason: "cancelled" }; const expired = await service.expireDue(job.data); await context.reportProgress({ expired: expired.length }); return { status: "completed", output: { expired: expired.length } }; } }; }
