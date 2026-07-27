import { createHmac } from "node:crypto";

/** Adapter target for SecretStore B3. The record must be decrypted only inside
 * its implementation; callers never receive a cross-tenant lookup primitive. */
export interface TenantProviderSecretStore {
  readActive(input: {
    readonly tenantId: string;
    readonly providerId: string;
  }): Promise<
    | {
        readonly tenantId: string;
        readonly providerId: string;
        readonly credentialId: string;
        readonly rotationEpoch: number;
        readonly secret: string;
      }
    | null
  >;
  currentEpoch(input: {
    readonly tenantId: string;
    readonly providerId: string;
  }): Promise<number>;
}

/** Metadata-only audit sink. Implementations must never accept a secret or a
 * credential identifier; fingerprints are keyed HMAC values. */
export interface TenantByokAuditSink {
  record(event: {
    readonly event: "resolved" | "unavailable" | "cache_evicted";
    readonly tenantId: string;
    readonly providerId: string;
    readonly epoch: number | null;
    readonly credentialFingerprint: string | null;
  }): Promise<void>;
}

export interface TenantByokCredentialLease {
  readonly secret: string;
  readonly metadata: {
    readonly providerId: string;
    readonly owner: "tenant";
    readonly source: "tenant_vault";
    readonly rotationEpoch: number;
    readonly referenceFingerprint: string;
    readonly credentialFingerprint: string;
  };
}

export interface TenantByokCredentialResolverOptions {
  readonly fingerprintKey: string;
  readonly cacheTtlMs?: number;
  readonly clock?: { now(): number };
}

interface CacheEntry {
  readonly epoch: number;
  readonly expiresAt: number;
  readonly lease: TenantByokCredentialLease;
}

const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const TENANT_ID = /^[0-9a-f-]{8,128}$/i;
const MIN_FINGERPRINT_KEY_LENGTH = 32;

/**
 * Fail-closed tenant BYOK credential resolver. Every lookup observes the
 * authoritative rotation/revocation epoch before using an in-process cache.
 * This makes a shared epoch store the cross-worker revocation contract.
 */
export class TenantByokCredentialResolver {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly cacheTtlMs: number;
  private readonly clock: { now(): number };

  constructor(
    private readonly store: TenantProviderSecretStore,
    private readonly audit: TenantByokAuditSink,
    private readonly options: TenantByokCredentialResolverOptions,
  ) {
    if (options.fingerprintKey.length < MIN_FINGERPRINT_KEY_LENGTH) {
      throw new Error("Tenant BYOK fingerprint key must be at least 32 characters.");
    }
    this.cacheTtlMs = options.cacheTtlMs ?? 30_000;
    if (!Number.isSafeInteger(this.cacheTtlMs) || this.cacheTtlMs < 0 || this.cacheTtlMs > 300_000) {
      throw new Error("Tenant BYOK cache TTL must be between 0 and 300000 milliseconds.");
    }
    this.clock = options.clock ?? { now: () => Date.now() };
  }

  async resolve(input: {
    readonly tenantId: string;
    readonly providerId: string;
  }): Promise<TenantByokCredentialLease | null> {
    const tenantId = requiredTenant(input.tenantId);
    const providerId = requiredProvider(input.providerId);
    const key = `${tenantId}\u0000${providerId}`;
    const epoch = await this.store.currentEpoch({ tenantId, providerId });
    if (!validEpoch(epoch)) return this.unavailable(tenantId, providerId, null);
    const cached = this.cache.get(key);
    if (cached && cached.epoch === epoch && cached.expiresAt > this.clock.now()) {
      await this.audit.record({ event: "resolved", tenantId, providerId, epoch, credentialFingerprint: cached.lease.metadata.credentialFingerprint });
      return cached.lease;
    }
    if (cached) {
      this.cache.delete(key);
      await this.audit.record({ event: "cache_evicted", tenantId, providerId, epoch, credentialFingerprint: null });
    }
    const record = await this.store.readActive({ tenantId, providerId });
    if (
      !record
      || record.tenantId !== tenantId
      || record.providerId !== providerId
      || record.rotationEpoch !== epoch
      || !safeSecret(record.secret)
      || !safeIdentifier(record.credentialId)
    ) return this.unavailable(tenantId, providerId, epoch);
    const lease = Object.freeze({
      secret: record.secret,
      metadata: Object.freeze({
        providerId,
        owner: "tenant" as const,
        source: "tenant_vault" as const,
        rotationEpoch: epoch,
        referenceFingerprint: this.fingerprint("ref", tenantId, providerId, record.credentialId),
        credentialFingerprint: this.fingerprint("credential", tenantId, providerId, record.secret),
      }),
    });
    if (this.cacheTtlMs > 0) this.cache.set(key, { epoch, expiresAt: this.clock.now() + this.cacheTtlMs, lease });
    await this.audit.record({ event: "resolved", tenantId, providerId, epoch, credentialFingerprint: lease.metadata.credentialFingerprint });
    return lease;
  }

  /** Notification handlers call this after a rotation/revocation event. The
   * next request also checks the shared epoch, so lost notifications fail safe. */
  async invalidate(input: { readonly tenantId: string; readonly providerId: string }): Promise<void> {
    const tenantId = requiredTenant(input.tenantId);
    const providerId = requiredProvider(input.providerId);
    this.cache.delete(`${tenantId}\u0000${providerId}`);
    await this.audit.record({ event: "cache_evicted", tenantId, providerId, epoch: null, credentialFingerprint: null });
  }

  private async unavailable(tenantId: string, providerId: string, epoch: number | null): Promise<null> {
    await this.audit.record({ event: "unavailable", tenantId, providerId, epoch, credentialFingerprint: null });
    return null;
  }

  private fingerprint(kind: "ref" | "credential", tenantId: string, providerId: string, value: string): string {
    const digest = createHmac("sha256", this.options.fingerprintKey)
      .update(kind).update("\0").update(tenantId).update("\0").update(providerId).update("\0").update(value)
      .digest("hex").slice(0, 32);
    return `${kind}:hmac-sha256:v1:${digest}`;
  }
}

function requiredTenant(value: string): string {
  if (!TENANT_ID.test(value)) throw new Error("Tenant BYOK tenant identifier is invalid.");
  return value;
}
function requiredProvider(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!PROVIDER_ID.test(normalized)) throw new Error("Tenant BYOK provider identifier is invalid.");
  return normalized;
}
function validEpoch(value: number): boolean { return Number.isSafeInteger(value) && value >= 1; }
function safeSecret(value: string): boolean { return typeof value === "string" && value.trim().length > 0 && value.length <= 32_768; }
function safeIdentifier(value: string): boolean { return typeof value === "string" && value.trim().length > 0 && value.length <= 200; }
