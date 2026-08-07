import type {
  AtlasStoredContentBlock,
  AtlasThreadRepositoryScope,
} from "./atlas-thread.types.js";

export type AtlasRetainedContentProtectionMode =
  | "database_at_rest_non_sensitive_only"
  | "tenant_protected_store";

export interface AtlasProtectedContentRef {
  readonly ref: string;
  readonly keyVersion: string;
}

/**
 * Tenant-aware application-encryption boundary. Implementations must treat
 * refs as opaque and must never accept a tenant identifier from browser input.
 */
export interface AtlasProtectedContentStore {
  put(
    context: AtlasThreadRepositoryScope,
    input: {
      readonly plaintext: Uint8Array;
      readonly classification: "sensitive";
      readonly idempotencyKey: string;
    },
  ): Promise<AtlasProtectedContentRef>;
  get(
    context: AtlasThreadRepositoryScope,
    reference: AtlasProtectedContentRef,
  ): Promise<Uint8Array>;
  rotate(
    context: AtlasThreadRepositoryScope,
    reference: AtlasProtectedContentRef,
  ): Promise<AtlasProtectedContentRef>;
  delete(
    context: AtlasThreadRepositoryScope,
    reference: AtlasProtectedContentRef,
  ): Promise<void>;
  readiness(): Promise<{
    readonly healthy: boolean;
    readonly encryptionVerified: boolean;
    readonly keyRotationVerified: boolean;
    readonly tenantIsolationVerified: boolean;
    readonly deletionAndPurgeVerified: boolean;
    readonly backupRecoveryVerified: boolean;
    readonly revokedKeyBehaviorVerified: boolean;
  }>;
}

export interface ProtectedAtlasMessageContent {
  readonly contentBlocks: readonly AtlasStoredContentBlock[];
  readonly protectedContentRef: string | null;
}

export class AtlasMessageContentProtector {
  constructor(private readonly store: AtlasProtectedContentStore) {}

  async protect(
    scope: AtlasThreadRepositoryScope,
    messageId: string,
    contentBlocks: readonly AtlasStoredContentBlock[],
  ): Promise<ProtectedAtlasMessageContent> {
    if (contentBlocks.length === 0) {
      return { contentBlocks: Object.freeze([]), protectedContentRef: null };
    }
    const plaintext = Buffer.from(JSON.stringify(contentBlocks), "utf8");
    const reference = await this.store.put(scope, {
      plaintext,
      classification: "sensitive",
      idempotencyKey: messageId,
    });
    return Object.freeze({
      contentBlocks: Object.freeze([]),
      protectedContentRef: encodeReference(reference),
    });
  }

  async reveal(
    scope: AtlasThreadRepositoryScope,
    protectedContentRef: string,
  ): Promise<readonly AtlasStoredContentBlock[]> {
    const plaintext = await this.store.get(
      scope,
      decodeReference(protectedContentRef),
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(Buffer.from(plaintext).toString("utf8"));
    } catch {
      throw new Error("Atlas protected content is not valid JSON.");
    }
    if (
      !Array.isArray(parsed)
      || parsed.some(
        (block) =>
          block === null
          || typeof block !== "object"
          || Array.isArray(block)
          || typeof (block as Record<string, unknown>)["type"] !== "string",
      )
    ) {
      throw new Error("Atlas protected content has an invalid block contract.");
    }
    return Object.freeze(
      parsed.map((block) =>
        Object.freeze({ ...(block as AtlasStoredContentBlock) })
      ),
    );
  }

  async delete(
    scope: AtlasThreadRepositoryScope,
    protectedContentRef: string,
  ): Promise<void> {
    await this.store.delete(scope, decodeReference(protectedContentRef));
  }
}

export async function assertSensitiveAtlasRetentionReady(input: {
  readonly mode: AtlasRetainedContentProtectionMode;
  readonly store?: AtlasProtectedContentStore;
}): Promise<void> {
  if (input.mode !== "tenant_protected_store" || !input.store) {
    throw new Error(
      "Sensitive Atlas retention requires an approved tenant protected-content store.",
    );
  }
  const readiness = await input.store.readiness();
  if (
    !readiness.healthy
    || !readiness.encryptionVerified
    || !readiness.keyRotationVerified
    || !readiness.tenantIsolationVerified
    || !readiness.deletionAndPurgeVerified
    || !readiness.backupRecoveryVerified
    || !readiness.revokedKeyBehaviorVerified
  ) {
    throw new Error(
      "The Atlas protected-content store has incomplete production evidence.",
    );
  }
}

function encodeReference(reference: AtlasProtectedContentRef): string {
  if (!reference.ref.trim() || !reference.keyVersion.trim()) {
    throw new Error("Atlas protected-content store returned an invalid reference.");
  }
  return `atlas-protected/v1/${
    Buffer.from(JSON.stringify({
      ref: reference.ref,
      key_version: reference.keyVersion,
    }), "utf8").toString("base64url")
  }`;
}

function decodeReference(value: string): AtlasProtectedContentRef {
  const prefix = "atlas-protected/v1/";
  if (!value.startsWith(prefix)) {
    throw new Error("Atlas protected-content reference version is unsupported.");
  }
  try {
    const parsed = JSON.parse(
      Buffer.from(value.slice(prefix.length), "base64url").toString("utf8"),
    ) as Record<string, unknown>;
    if (
      typeof parsed["ref"] !== "string"
      || !parsed["ref"].trim()
      || typeof parsed["key_version"] !== "string"
      || !parsed["key_version"].trim()
    ) {
      throw new Error();
    }
    return {
      ref: parsed["ref"],
      keyVersion: parsed["key_version"],
    };
  } catch {
    throw new Error("Atlas protected-content reference is malformed.");
  }
}
