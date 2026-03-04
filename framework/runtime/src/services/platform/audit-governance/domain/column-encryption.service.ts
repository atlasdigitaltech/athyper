/**
 * Audit Column-Level Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive audit event columns:
 *   - ip_address
 *   - user_agent
 *   - comment
 *   - attachments
 *
 * Each tenant gets a unique Key Encryption Key (KEK) derived from a master
 * key + tenant_id salt via PBKDF2. Key rotation is supported via versioned
 * keys — old data keeps its key_version, new data uses the latest.
 *
 * Encrypted payloads are stored as base64-encoded JSON:
 *   { "c": "<ciphertext>", "iv": "<iv>", "t": "<tag>", "v": <keyVersion> }
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";

// ============================================================================
// Constants
// ============================================================================

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit IV per NIST recommendation
const TAG_LENGTH = 16; // 128-bit auth tag
const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256-bit AES key

/** Columns that are encrypted when encryption is enabled */
export const ENCRYPTED_COLUMNS = ["ip_address", "user_agent", "comment", "attachments"] as const;
export type EncryptedColumnName = (typeof ENCRYPTED_COLUMNS)[number];

// ============================================================================
// Types
// ============================================================================

/**
 * Compact encrypted payload stored in the database column.
 * Uses short keys to minimize storage overhead.
 */
export interface EncryptedPayload {
  /** Ciphertext (base64) */
  c: string;
  /** Initialization vector (base64) */
  iv: string;
  /** Auth tag (base64) */
  t: string;
  /** Key version used for encryption */
  v: number;
}

/**
 * Provides tenant-specific key encryption keys.
 * Implementations may derive keys from config, HSM, or KMS.
 */
export interface TenantKeyProvider {
  /** Get the current KEK for a tenant (returns key + version) */
  getKek(tenantId: string): Promise<{ key: Buffer; version: number }>;

  /** Get a specific KEK version for decryption */
  getKekByVersion(tenantId: string, version: number): Promise<{ key: Buffer; version: number }>;

  /** Rotate the KEK for a tenant, returning the new version */
  rotateKek(tenantId: string): Promise<number>;
}

// ============================================================================
// Config-Based Key Provider
// ============================================================================

/**
 * Derives tenant KEKs from a master key + tenant_id salt via PBKDF2.
 *
 * Key derivation: PBKDF2(masterKey, "audit:" + tenantId + ":" + version, 100k, sha512) → 256-bit key
 *
 * This is suitable for single-process deployments. For production multi-worker
 * deployments, consider a KMS-backed provider (AWS KMS, Azure Key Vault, etc.).
 */
export class ConfigBasedKeyProvider implements TenantKeyProvider {
  private readonly masterKey: string;
  private readonly tenantVersions = new Map<string, number>();

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 32) {
      throw new Error("Audit encryption master key must be at least 32 characters");
    }
    this.masterKey = masterKey;
  }

  async getKek(tenantId: string): Promise<{ key: Buffer; version: number }> {
    const version = this.tenantVersions.get(tenantId) ?? 1;
    return this.deriveKey(tenantId, version);
  }

  async getKekByVersion(tenantId: string, version: number): Promise<{ key: Buffer; version: number }> {
    return this.deriveKey(tenantId, version);
  }

  async rotateKek(tenantId: string): Promise<number> {
    const current = this.tenantVersions.get(tenantId) ?? 1;
    const next = current + 1;
    this.tenantVersions.set(tenantId, next);
    return next;
  }

  private deriveKey(tenantId: string, version: number): { key: Buffer; version: number } {
    const salt = `audit:${tenantId}:${version}`;
    const key = pbkdf2Sync(this.masterKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha512");
    return { key, version };
  }
}

// ============================================================================
// Encryption Service
// ============================================================================

export class AuditColumnEncryptionService {
  constructor(private readonly keyProvider: TenantKeyProvider) {}

  /**
   * Encrypt a plaintext value for storage.
   * Returns a JSON string containing the encrypted payload.
   * Returns null if the input is null/undefined.
   */
  async encrypt(tenantId: string, plaintext: string | null | undefined): Promise<string | null> {
    if (plaintext === null || plaintext === undefined) {
      return null;
    }

    const { key, version } = await this.keyProvider.getKek(tenantId);
    const iv = randomBytes(IV_LENGTH);

    const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    const encrypted = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    const payload: EncryptedPayload = {
      c: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      t: tag.toString("base64"),
      v: version,
    };

    return JSON.stringify(payload);
  }

  /**
   * Decrypt a stored encrypted payload back to plaintext.
   * Returns null if the input is null/undefined.
   * If the value is not a valid encrypted payload, returns it as-is
   * (supports reading pre-encryption data).
   */
  async decrypt(tenantId: string, stored: string | null | undefined): Promise<string | null> {
    if (stored === null || stored === undefined) {
      return null;
    }

    // Try to parse as encrypted payload
    let payload: EncryptedPayload;
    try {
      payload = JSON.parse(stored);
    } catch {
      // Not JSON — return as-is (pre-encryption plaintext)
      return stored;
    }

    // Validate structure (use explicit checks — c can be "" for empty plaintext)
    if (
      typeof payload.c !== "string" ||
      typeof payload.iv !== "string" || !payload.iv ||
      typeof payload.t !== "string" || !payload.t ||
      typeof payload.v !== "number"
    ) {
      // Not an encrypted payload — return as-is
      return stored;
    }

    const { key } = await this.keyProvider.getKekByVersion(tenantId, payload.v);
    const iv = Buffer.from(payload.iv, "base64");
    const tag = Buffer.from(payload.t, "base64");
    const ciphertext = Buffer.from(payload.c, "base64");

    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: TAG_LENGTH });
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  }

  /**
   * Encrypt multiple columns for a single event.
   * Returns an object with the encrypted column values + key_version.
   */
  async encryptColumns(
    tenantId: string,
    columns: {
      ip_address?: string | null;
      user_agent?: string | null;
      comment?: string | null;
      attachments?: string | null;
    },
  ): Promise<{
    ip_address: string | null;
    user_agent: string | null;
    comment: string | null;
    attachments: string | null;
    key_version: number;
  }> {
    const { version } = await this.keyProvider.getKek(tenantId);

    const [ip, ua, comment, attachments] = await Promise.all([
      this.encrypt(tenantId, columns.ip_address),
      this.encrypt(tenantId, columns.user_agent),
      this.encrypt(tenantId, columns.comment),
      this.encrypt(tenantId, columns.attachments),
    ]);

    return {
      ip_address: ip,
      user_agent: ua,
      comment,
      attachments,
      key_version: version,
    };
  }

  /**
   * Decrypt multiple columns for a single event.
   */
  async decryptColumns(
    tenantId: string,
    columns: {
      ip_address?: string | null;
      user_agent?: string | null;
      comment?: string | null;
      attachments?: string | null;
    },
  ): Promise<{
    ip_address: string | null;
    user_agent: string | null;
    comment: string | null;
    attachments: string | null;
  }> {
    const [ip, ua, comment, attachments] = await Promise.all([
      this.decrypt(tenantId, columns.ip_address),
      this.decrypt(tenantId, columns.user_agent),
      this.decrypt(tenantId, columns.comment),
      this.decrypt(tenantId, columns.attachments),
    ]);

    return {
      ip_address: ip,
      user_agent: ua,
      comment,
      attachments,
    };
  }

  /**
   * Re-encrypt a value from an old key version to the current version.
   * Used by the key rotation worker.
   */
  async reEncrypt(tenantId: string, stored: string | null | undefined): Promise<string | null> {
    if (stored === null || stored === undefined) return null;

    // Decrypt with the old key
    const plaintext = await this.decrypt(tenantId, stored);
    if (plaintext === null) return null;

    // Re-encrypt with the current key
    return this.encrypt(tenantId, plaintext);
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createColumnEncryptionService(
  masterKey: string,
): AuditColumnEncryptionService {
  const keyProvider = new ConfigBasedKeyProvider(masterKey);
  return new AuditColumnEncryptionService(keyProvider);
}
