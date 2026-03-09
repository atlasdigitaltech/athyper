// framework/runtime/src/services/business/engines/report-pack-engine/services/pack-certification-service.ts
//
// Manages the certification lifecycle for pack instances:
// PENDING → IN_REVIEW → REVIEWED → APPROVED → CERTIFIED
//
// Integrates with wf.approval_instance for formal approval workflows.

import { ok, fail, validateTransition } from "../../shared/engine-base.js";

import type {
  ServiceResult,
  OperationContext,
} from "../../shared/engine-base.js";
import type {
  PackCertification,
  CertificationStatus,
  PackActivity,
} from "../domain/types.js";
import { CERTIFICATION_TRANSITIONS } from "../domain/types.js";
import type { PackInstanceRepo } from "../persistence/pack-repo.js";
import type {
  CertificationRepo,
  PackActivityRepo,
} from "../persistence/governance-repo.js";

// ---------------------------------------------------------------------------
// Service interface
// ---------------------------------------------------------------------------

export interface PackCertificationService {
  /** Initialize certification for a pack instance */
  initCertification(
    ctx: OperationContext,
    packInstanceId: string,
  ): Promise<ServiceResult<PackCertification>>;

  /** Get certification for a pack instance */
  getCertification(
    packInstanceId: string,
  ): Promise<ServiceResult<PackCertification>>;

  /** Advance certification status */
  advanceCertification(
    ctx: OperationContext,
    packInstanceId: string,
    targetStatus: CertificationStatus,
    notes?: string,
  ): Promise<ServiceResult<PackCertification>>;

  /** Update disclosure notes */
  updateDisclosure(
    ctx: OperationContext,
    packInstanceId: string,
    disclosureNotes: string,
  ): Promise<ServiceResult<PackCertification>>;

  /** Get activity timeline for a pack */
  getActivity(
    packInstanceId: string,
    limit?: number,
  ): Promise<PackActivity[]>;
}

// ---------------------------------------------------------------------------
// Default implementation
// ---------------------------------------------------------------------------

export class DefaultPackCertificationService
  implements PackCertificationService
{
  constructor(
    private readonly certRepo: CertificationRepo,
    private readonly instanceRepo: PackInstanceRepo,
    private readonly activityRepo: PackActivityRepo,
  ) {}

  async initCertification(
    ctx: OperationContext,
    packInstanceId: string,
  ): Promise<ServiceResult<PackCertification>> {
    // Verify pack instance exists
    const instance = await this.instanceRepo.getById(ctx.tenantId, packInstanceId);
    if (!instance) {
      return fail("INSTANCE_NOT_FOUND", `Pack instance ${packInstanceId} not found`);
    }

    // Check if certification already exists
    const existing = await this.certRepo.getByPackInstance(packInstanceId);
    if (existing) {
      return ok(existing);
    }

    // Create certification record
    const cert = await this.certRepo.create({
      tenantId: ctx.tenantId,
      packInstanceId,
      preparedBy: ctx.actorId,
      preparedByName: null, // resolved by caller if needed
    });

    // Log activity
    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance.entityCode,
      packInstanceId,
      activityType: "PACK_GENERATED",
      actorType: ctx.actorType === "SYSTEM" ? "system" : "user",
      actorId: ctx.actorId,
      message: "Certification initialized",
    });

    return ok(cert);
  }

  async getCertification(
    packInstanceId: string,
  ): Promise<ServiceResult<PackCertification>> {
    const cert = await this.certRepo.getByPackInstance(packInstanceId);
    if (!cert) {
      return fail("CERTIFICATION_NOT_FOUND", `No certification for pack ${packInstanceId}`);
    }
    return ok(cert);
  }

  async advanceCertification(
    ctx: OperationContext,
    packInstanceId: string,
    targetStatus: CertificationStatus,
    notes?: string,
  ): Promise<ServiceResult<PackCertification>> {
    const cert = await this.certRepo.getByPackInstance(packInstanceId);
    if (!cert) {
      return fail("CERTIFICATION_NOT_FOUND", `No certification for pack ${packInstanceId}`);
    }

    // Validate transition
    if (!validateTransition(cert.certificationStatus, targetStatus, CERTIFICATION_TRANSITIONS)) {
      return fail(
        "INVALID_TRANSITION",
        `Cannot transition certification from ${cert.certificationStatus} to ${targetStatus}`,
      );
    }

    // Update certification
    const updated = await this.certRepo.updateStatus(
      cert.id,
      targetStatus,
      ctx.actorId,
      "", // name resolved by repo/caller
      notes ?? null,
    );

    // Map certification status to activity type
    const activityType = mapCertStatusToActivityType(targetStatus);

    // Get instance for entity_code
    const instance = await this.instanceRepo.getById(ctx.tenantId, packInstanceId);

    await this.activityRepo.log({
      tenantId: ctx.tenantId,
      entityCode: instance?.entityCode ?? "",
      packInstanceId,
      activityType,
      actorType: ctx.actorType === "SYSTEM" ? "system" : "user",
      actorId: ctx.actorId,
      message: `Certification ${targetStatus.toLowerCase()}${notes ? `: ${notes}` : ""}`,
      payload: { fromStatus: cert.certificationStatus, toStatus: targetStatus },
    });

    return ok(updated);
  }

  async updateDisclosure(
    ctx: OperationContext,
    packInstanceId: string,
    disclosureNotes: string,
  ): Promise<ServiceResult<PackCertification>> {
    const cert = await this.certRepo.getByPackInstance(packInstanceId);
    if (!cert) {
      return fail("CERTIFICATION_NOT_FOUND", `No certification for pack ${packInstanceId}`);
    }

    await this.certRepo.updateDisclosureNotes(cert.id, disclosureNotes);

    // Return updated
    const updated = await this.certRepo.getByPackInstance(packInstanceId);
    return ok(updated!);
  }

  async getActivity(
    packInstanceId: string,
    limit?: number,
  ): Promise<PackActivity[]> {
    return this.activityRepo.listByPackInstance(packInstanceId, limit);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapCertStatusToActivityType(
  status: CertificationStatus,
): PackActivity["activityType"] {
  switch (status) {
    case "IN_REVIEW": return "REVIEW_STARTED";
    case "REVIEWED": return "REVIEW_COMPLETED";
    case "APPROVED": return "APPROVAL_GRANTED";
    case "CERTIFIED": return "CERTIFICATION_GRANTED";
    case "REJECTED": return "APPROVAL_REJECTED";
    default: return "STATUS_CHANGED";
  }
}
