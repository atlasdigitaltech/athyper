/**
 * CredentialEncryptionService — Phase 1.7
 *
 * AES-256-GCM field encryption for sensitive DB columns.
 * Consumed by:
 *   Phase 4.1 — audit log field encryption (log.audit_event PII columns)
 *   Phase 5.3 — integration endpoint credential storage (event.endpoint.config.auth,
 *               event.webhook_subscription.signing_secret)
 *
 * Key derivation: PBKDF2(masterKey, tenantId + ':' + version, 100_000 iter, sha512)
 * → 256-bit AES key. Version is an integer that increments on rotation.
 *
 * Encrypted payload format (JSON string stored in DB column):
 *   { c: base64_ciphertext, iv: base64_iv, t: base64_auth_tag, v: key_version }
 *
 * Backward-compat: decrypt() returns plaintext unchanged if the stored value
 * is not a valid EncryptedPayload JSON — supports columns that were not yet
 * encrypted on legacy rows.
 *
 * ConfigBasedKeyProvider — default for single-process deployments.
 * Reads CREDENTIAL_MASTER_KEY env var (min 32 characters). For production
 * multi-worker deployments swap to a KMS-backed TenantKeyProvider implementation.
 */

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_LENGTH    = 32;  // 256-bit AES key
const IV_LENGTH     = 16;  // 128-bit AES-GCM IV
const TAG_LENGTH    = 16;  // 128-bit GCM auth tag
const KDF_ITER      = 100_000;
const KDF_DIGEST    = "sha512";
const INITIAL_VERSION = 1;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  /** Ciphertext, base64 */
  c: string;
  /** Initialisation vector, base64 */
  iv: string;
  /** GCM authentication tag, base64 */
  t: string;
  /** Key version (incremented on rotation) */
  v: number;
}

export interface TenantKeyProvider {
  getKek(tenantId: string): Promise<{ key: Buffer; version: number }>;
  getKekByVersion(tenantId: string, version: number): Promise<{ key: Buffer; version: number }>;
  rotateKek(tenantId: string): Promise<number>;
}

// ── ConfigBasedKeyProvider ────────────────────────────────────────────────────

/**
 * PBKDF2-based key provider that derives tenant KEKs from a single master key
 * loaded from the CREDENTIAL_MASTER_KEY environment variable.
 *
 * Key derivation: PBKDF2(masterKey, '<tenantId>:<version>', KDF_ITER, KEY_LENGTH, KDF_DIGEST)
 *
 * Version is stored in an in-memory map. For production environments with
 * multiple workers, use a KMS-backed provider where version is persisted centrally.
 */
export class ConfigBasedKeyProvider implements TenantKeyProvider {
  private readonly masterKey: string;
  private readonly versions = new Map<string, number>();

  constructor(masterKey?: string) {
    const key = masterKey ?? process.env["CREDENTIAL_MASTER_KEY"] ?? "";
    if (key.length < 32) {
      throw new Error(
        "CREDENTIAL_MASTER_KEY must be at least 32 characters. " +
        "Set the CREDENTIAL_MASTER_KEY environment variable."
      );
    }
    this.masterKey = key;
  }

  async getKek(tenantId: string): Promise<{ key: Buffer; version: number }> {
    const version = this.versions.get(tenantId) ?? INITIAL_VERSION;
    return { key: this.deriveKey(tenantId, version), version };
  }

  async getKekByVersion(tenantId: string, version: number): Promise<{ key: Buffer; version: number }> {
    return { key: this.deriveKey(tenantId, version), version };
  }

  async rotateKek(tenantId: string): Promise<number> {
    const current = this.versions.get(tenantId) ?? INITIAL_VERSION;
    const next = current + 1;
    this.versions.set(tenantId, next);
    return next;
  }

  private deriveKey(tenantId: string, version: number): Buffer {
    const salt = Buffer.from(`${tenantId}:${version}`, "utf8");
    return pbkdf2Sync(this.masterKey, salt, KDF_ITER, KEY_LENGTH, KDF_DIGEST);
  }
}

// ── CredentialEncryptionService ───────────────────────────────────────────────

export class CredentialEncryptionService {
  private readonly keyProvider: TenantKeyProvider;

  constructor(keyProvider: TenantKeyProvider) {
    this.keyProvider = keyProvider;
  }

  /**
   * Encrypt a plaintext string for a tenant.
   * Returns an EncryptedPayload. Store JSON.stringify(payload) in the DB column.
   */
  async encrypt(
    tenantId: string,
    plaintext: string,
  ): Promise<EncryptedPayload> {
    const { key, version } = await this.keyProvider.getKek(tenantId);
    const iv     = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ct     = Buffer.concat([
      cipher.update(Buffer.from(plaintext, "utf8")),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return {
      c:  ct.toString("base64"),
      iv: iv.toString("base64"),
      t:  tag.toString("base64"),
      v:  version,
    };
  }

  /**
   * Decrypt a stored EncryptedPayload back to plaintext.
   * Accepts either a parsed EncryptedPayload object or a JSON string.
   *
   * Backward-compat: if the stored value is not a valid EncryptedPayload,
   * it is returned as-is (was never encrypted — legacy plaintext row).
   */
  async decrypt(
    tenantId: string,
    stored: string | EncryptedPayload | null | undefined,
  ): Promise<string | null> {
    if (stored == null) return null;

    let payload: EncryptedPayload;
    if (typeof stored === "string") {
      const parsed = tryParseEncryptedPayload(stored);
      if (!parsed) return stored; // legacy plaintext — return as-is
      payload = parsed;
    } else {
      payload = stored;
    }

    const { key } = await this.keyProvider.getKekByVersion(tenantId, payload.v);
    const iv       = Buffer.from(payload.iv, "base64");
    const ct       = Buffer.from(payload.c,  "base64");
    const tag      = Buffer.from(payload.t,  "base64");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  }

  /**
   * Encrypt specific fields in a JSONB object before DB storage.
   * Each named field value is serialised to string, encrypted, and
   * replaced with the compact JSON of the EncryptedPayload.
   *
   * Non-string field values are JSON.stringify'd before encryption.
   * Null / undefined field values are left unchanged.
   */
  async encryptJsonField(
    tenantId: string,
    obj: Record<string, unknown>,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    const result = { ...obj };
    for (const field of fields) {
      const value = result[field];
      if (value == null) continue;
      const plaintext =
        typeof value === "string" ? value : JSON.stringify(value);
      const payload = await this.encrypt(tenantId, plaintext);
      result[field] = JSON.stringify(payload);
    }
    return result;
  }

  /**
   * Decrypt specific fields in a JSONB object after DB read.
   * Each named field's stored value is parsed and decrypted back to its
   * original form. Fields absent from the object are skipped silently.
   */
  async decryptJsonField(
    tenantId: string,
    obj: Record<string, unknown>,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    const result = { ...obj };
    for (const field of fields) {
      const stored = result[field];
      if (stored == null) continue;
      const raw = typeof stored === "string" ? stored : JSON.stringify(stored);
      const plaintext = await this.decrypt(tenantId, raw);
      if (plaintext == null) continue;
      // Attempt to re-parse if original was non-string JSON
      try {
        result[field] = JSON.parse(plaintext);
      } catch {
        result[field] = plaintext;
      }
    }
    return result;
  }

  /**
   * Re-encrypt a stored payload using the current (latest) key version.
   * Used by the key rotation worker (Phase 4) to migrate rows to a new KEK.
   * Returns null if stored is null / already-plaintext (skips those rows).
   */
  async reEncrypt(
    tenantId: string,
    stored: string | null | undefined,
  ): Promise<string | null> {
    if (stored == null) return null;
    const payload = tryParseEncryptedPayload(stored);
    if (!payload) return null; // plaintext row — skip re-encryption
    const plaintext = await this.decrypt(tenantId, payload);
    if (plaintext == null) return null;
    const newPayload = await this.encrypt(tenantId, plaintext);
    return JSON.stringify(newPayload);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function tryParseEncryptedPayload(raw: string): EncryptedPayload | null {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof obj["c"]  === "string" &&
      typeof obj["iv"] === "string" &&
      typeof obj["t"]  === "string" &&
      typeof obj["v"]  === "number"
    ) {
      return { c: obj["c"], iv: obj["iv"], t: obj["t"], v: obj["v"] };
    }
    return null;
  } catch {
    return null;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates a CredentialEncryptionService backed by ConfigBasedKeyProvider.
 * Reads CREDENTIAL_MASTER_KEY from env. Throws at construction if the key
 * is absent or too short — fail fast, don't discover this at first encrypt call.
 */
export function createCredentialEncryptionService(
  masterKey?: string,
): CredentialEncryptionService {
  return new CredentialEncryptionService(new ConfigBasedKeyProvider(masterKey));
}
