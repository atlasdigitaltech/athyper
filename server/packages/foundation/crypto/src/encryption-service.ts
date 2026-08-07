/**
 * CredentialEncryptionService — AES-256-GCM field encryption port.
 *
 * Exports the encryption format (EncryptedPayload), the TenantKeyProvider
 * port, and the CredentialEncryptionService.
 *
 * Concrete key providers live in adapters:
 *   adapters/crypto-local — ConfigBasedKeyProvider (env-var / dev)
 *   adapters/kms          — future AWS/Azure/Vault provider
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_LENGTH    = 32;  // 256-bit AES key
const IV_LENGTH     = 16;  // 128-bit AES-GCM IV
const TAG_LENGTH    = 16;  // 128-bit GCM auth tag

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

// ── CredentialEncryptionService ───────────────────────────────────────────────

export class CredentialEncryptionService {
  private readonly keyProvider: TenantKeyProvider;

  constructor(keyProvider: TenantKeyProvider) {
    this.keyProvider = keyProvider;
  }

  async encrypt(tenantId: string, plaintext: string): Promise<EncryptedPayload> {
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

  async decrypt(
    tenantId: string,
    stored: string | EncryptedPayload | null | undefined,
  ): Promise<string | null> {
    if (stored == null) return null;

    let payload: EncryptedPayload;
    if (typeof stored === "string") {
      const parsed = tryParseEncryptedPayload(stored);
      if (!parsed) return stored; // legacy plaintext
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

  async encryptJsonField(
    tenantId: string,
    obj: Record<string, unknown>,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    const result = { ...obj };
    for (const field of fields) {
      const value = result[field];
      if (value == null) continue;
      const plaintext = typeof value === "string" ? value : JSON.stringify(value);
      const payload = await this.encrypt(tenantId, plaintext);
      result[field] = JSON.stringify(payload);
    }
    return result;
  }

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
      try {
        result[field] = JSON.parse(plaintext);
      } catch {
        result[field] = plaintext;
      }
    }
    return result;
  }

  async reEncrypt(
    tenantId: string,
    stored: string | null | undefined,
  ): Promise<string | null> {
    if (stored == null) return null;
    const payload = tryParseEncryptedPayload(stored);
    if (!payload) return null;
    const plaintext = await this.decrypt(tenantId, payload);
    if (plaintext == null) return null;
    const newPayload = await this.encrypt(tenantId, plaintext);
    return JSON.stringify(newPayload);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function tryParseEncryptedPayload(raw: string): EncryptedPayload | null {
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

// Suppress unused import warning — TAG_LENGTH is part of the AES-GCM contract
void TAG_LENGTH;
