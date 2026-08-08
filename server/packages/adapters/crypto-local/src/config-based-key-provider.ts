/**
 * ConfigBasedKeyProvider — development / single-process key provider.
 *
 * Derives tenant KEKs via PBKDF2 from a single master key read from the
 * CREDENTIAL_MASTER_KEY environment variable. Key versions are kept
 * in-process memory — suitable for single-worker deployments only.
 *
 * For multi-worker production deployments use adapters/kms instead, where
 * the current version is persisted centrally and shared across workers.
 */

import { pbkdf2Sync } from "crypto";
import type { TenantKeyProvider } from "@athyper/server-foundation/crypto";
import { CredentialEncryptionService } from "@athyper/server-foundation/crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_LENGTH    = 32;
const KDF_ITER      = 100_000;
const KDF_DIGEST    = "sha512";
const INITIAL_VERSION = 1;

// ── ConfigBasedKeyProvider ────────────────────────────────────────────────────

export class ConfigBasedKeyProvider implements TenantKeyProvider {
  private readonly masterKey: string;
  private readonly versions = new Map<string, number>();

  constructor(masterKey?: string) {
    const key = masterKey ?? process.env["CREDENTIAL_MASTER_KEY"] ?? "";
    if (key.length < 32) {
      throw new Error(
        "CREDENTIAL_MASTER_KEY must be at least 32 characters. " +
        "Set the CREDENTIAL_MASTER_KEY environment variable.",
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

// ── Factory ───────────────────────────────────────────────────────────────────

export function createCredentialEncryptionService(
  masterKey?: string,
): CredentialEncryptionService {
  return new CredentialEncryptionService(new ConfigBasedKeyProvider(masterKey));
}
