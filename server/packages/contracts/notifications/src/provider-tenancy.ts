/** Provider-neutral lifecycle state for a transactional-email tenant. */
export type EmailProviderTenantLifecycle = "active" | "suspended";

export interface EmailProviderTenantDesiredState {
  /** Canonical Athyper tenant UUID. It must never be used directly as a provider name. */
  readonly tenantId: string;
  /** Stable, non-PII provider coordinate derived from tenantId. */
  readonly providerTenantName: string;
  readonly lifecycle: EmailProviderTenantLifecycle;
  readonly identity: {
    readonly resourceName: string;
    readonly verified: true;
  };
  readonly configurationSet: {
    readonly resourceName: string;
  };
  readonly suppressionReasons: readonly EmailSuppressionReason[];
}

export interface EmailProviderTenantSnapshot {
  readonly providerTenantName: string;
  readonly lifecycle: EmailProviderTenantLifecycle;
  readonly identityResourceNames: readonly string[];
  readonly configurationSetResourceNames: readonly string[];
  readonly suppressionReasons: readonly EmailSuppressionReason[];
}

/**
 * Idempotent provider control-plane boundary. Implementations may call SES v2,
 * another transactional-email provider, or a deterministic test double.
 */
export interface EmailProviderTenantControlPlane {
  read(providerTenantName: string): Promise<EmailProviderTenantSnapshot | undefined>;
  ensureTenant(input: {
    readonly providerTenantName: string;
    readonly lifecycle: EmailProviderTenantLifecycle;
    readonly idempotencyKey: string;
  }): Promise<void>;
  ensureResourceAssociation(input: {
    readonly providerTenantName: string;
    readonly resourceType: "identity" | "configuration_set";
    readonly resourceName: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
  ensureSuppressionPolicy(input: {
    readonly providerTenantName: string;
    readonly reasons: readonly EmailSuppressionReason[];
    readonly idempotencyKey: string;
  }): Promise<void>;
}

export type EmailSuppressionReason = "bounce" | "complaint";

export interface EmailSuppressionChange {
  readonly tenantId: string;
  readonly recipientAddress: string;
  readonly operation: "suppress" | "release";
  readonly reason: EmailSuppressionReason;
  readonly sourceEventId: string;
}

/** Provider boundary for recipient suppression. Addresses are never returned. */
export interface EmailProviderSuppressionControlPlane {
  apply(input: {
    readonly providerTenantName: string;
    readonly recipientAddress: string;
    readonly operation: "suppress" | "release";
    readonly reason: EmailSuppressionReason;
    readonly idempotencyKey: string;
  }): Promise<{ readonly changed: boolean }>;
}

export interface EmailTenantReconciliationResult {
  readonly providerTenantName: string;
  readonly outcome: "created" | "updated" | "unchanged";
  readonly desiredStateHash: string;
}

export interface EmailSuppressionSyncResult {
  readonly providerTenantName: string;
  readonly recipientRef: string;
  readonly operation: "suppress" | "release";
  readonly changed: boolean;
}
