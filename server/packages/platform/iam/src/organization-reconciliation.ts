import { createHash } from "node:crypto";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { assertIamPlane } from "./iam-contracts.js";

export interface OrganizationProjection {
  readonly organizationId: string;
  readonly tenantId: string;
  readonly planeKey: PlaneKey;
  readonly providerOrganizationId: string;
  readonly version: number;
  readonly hash: string;
  readonly active: boolean;
}

export function projectionHash(value: Omit<OrganizationProjection, "hash">): string {
  assertIamPlane(value.planeKey);
  return createHash("sha256").update(JSON.stringify({
    active: value.active, organizationId: value.organizationId, planeKey: value.planeKey,
    providerOrganizationId: value.providerOrganizationId, tenantId: value.tenantId, version: value.version,
  })).digest("hex");
}

export function verifyOrganizationProjection(projection: OrganizationProjection): void {
  if (!Number.isSafeInteger(projection.version) || projection.version < 1) throw new TypeError("Projection version must be positive");
  const expected = projectionHash(projection);
  if (projection.hash !== expected) throw new Error("Organization projection hash mismatch");
}

export function shouldApplyProjection(current: OrganizationProjection | undefined, incoming: OrganizationProjection): boolean {
  verifyOrganizationProjection(incoming);
  if (!current) return true;
  verifyOrganizationProjection(current);
  if (incoming.organizationId !== current.organizationId
    || incoming.tenantId !== current.tenantId
    || incoming.providerOrganizationId !== current.providerOrganizationId
    || incoming.planeKey !== current.planeKey) {
    throw new Error("Organization projection identity mismatch");
  }
  if (incoming.version < current.version) return false;
  if (incoming.version === current.version && incoming.hash !== current.hash) throw new Error("Organization projection version conflict");
  return incoming.version > current.version;
}
