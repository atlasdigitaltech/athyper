import { createHash } from "node:crypto";
import type { PlaneKey } from "@athyper/server-foundation/context";
import { assertIamPlane } from "./iam-contracts.js";

export const PROVISIONING_STATES = Object.freeze([
  "requested", "provisioning", "invited", "active", "suspended", "failed", "deprovisioning", "deprovisioned",
] as const);
export type ProvisioningState = (typeof PROVISIONING_STATES)[number];

export interface ProvisioningRequest {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
  readonly tenantId: string;
  readonly realmKey: string;
  readonly normalizedIdentifier: string;
  readonly displayIdentifier: string;
  readonly planes: readonly PlaneKey[];
  readonly state: ProvisioningState;
  readonly providerSubject?: string;
  readonly failureReason?: string;
  readonly version: number;
}

export class ProvisioningIdempotencyConflictError extends Error {
  constructor() { super("Provisioning idempotency key was reused with different request parameters"); this.name = "ProvisioningIdempotencyConflictError"; }
}

export interface CreateProvisioningRequest {
  readonly tenantId: string;
  readonly realmKey: string;
  readonly identifier: string;
  readonly planes: readonly PlaneKey[];
}

export interface ProvisioningRepository {
  findByIdempotencyKey(key: string): Promise<ProvisioningRequest | undefined>;
  createWithAuditAndOutbox(request: ProvisioningRequest): Promise<void>;
  transitionWithAuditAndOutbox(id: string, expectedVersion: number, update: Pick<ProvisioningRequest, "state"> & Partial<Pick<ProvisioningRequest, "providerSubject" | "failureReason">>): Promise<ProvisioningRequest>;
}

const TRANSITIONS: Readonly<Record<ProvisioningState, readonly ProvisioningState[]>> = Object.freeze({
  requested: ["provisioning", "failed"], provisioning: ["invited", "active", "failed"],
  invited: ["active", "suspended", "failed"], active: ["suspended", "deprovisioning"],
  suspended: ["active", "deprovisioning"], failed: ["provisioning", "deprovisioning"],
  deprovisioning: ["deprovisioned", "failed"], deprovisioned: [],
});

export function createProvisioningService(repository: ProvisioningRepository, createId: () => string) {
  return {
    async request(input: CreateProvisioningRequest): Promise<ProvisioningRequest> {
      const normalizedIdentifier = normalizeIdentityIdentifier(input.identifier);
      const realmKey = required(input.realmKey, "realmKey").normalize("NFKC").toLocaleLowerCase("en-US");
      const tenantId = required(input.tenantId, "tenantId");
      const planes = Object.freeze([...new Set(input.planes)].sort());
      if (planes.length === 0) throw new TypeError("At least one target plane is required");
      planes.forEach(assertIamPlane);
      const idempotencyKey = digest(`${tenantId}\n${realmKey}\n${normalizedIdentifier}`);
      const requestFingerprint = digest(JSON.stringify({ tenantId, realmKey, normalizedIdentifier, planes }));
      const existing = await repository.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw new ProvisioningIdempotencyConflictError();
        return existing;
      }
      const request: ProvisioningRequest = Object.freeze({
        id: createId(), idempotencyKey, requestFingerprint, tenantId, realmKey, normalizedIdentifier,
        displayIdentifier: input.identifier.trim(), planes, state: "requested", version: 1,
      });
      await repository.createWithAuditAndOutbox(request);
      return request;
    },
    async transition(current: ProvisioningRequest, state: ProvisioningState, details: { providerSubject?: string; failureReason?: string } = {}) {
      if (!TRANSITIONS[current.state].includes(state)) throw new Error(`Invalid provisioning transition: ${current.state} -> ${state}`);
      if (state === "failed" && !details.failureReason?.trim()) throw new TypeError("A failed transition requires a failure reason");
      return repository.transitionWithAuditAndOutbox(current.id, current.version, { state, ...details });
    },
  };
}

export function normalizeIdentityIdentifier(value: string): string {
  const normalized = value.trim().normalize("NFKC").toLocaleLowerCase("en-US");
  if (!normalized || normalized.length > 320) throw new TypeError("Identity identifier is invalid");
  return normalized;
}

function required(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
