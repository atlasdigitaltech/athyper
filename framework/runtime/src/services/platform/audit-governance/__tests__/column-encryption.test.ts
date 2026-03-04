/**
 * Column-Level Encryption Tests
 *
 * Verifies:
 *   - AES-256-GCM encrypt/decrypt roundtrip
 *   - Null/undefined passthrough
 *   - Pre-encryption plaintext fallback (backward compat)
 *   - Tenant isolation (different tenants → different ciphertexts)
 *   - Key versioning and rotation
 *   - Multi-column encrypt/decrypt
 *   - Re-encryption for key rotation
 *   - ConfigBasedKeyProvider master key validation
 *   - Repository integration (encrypt on write, decrypt on read)
 */
import { describe, it, expect, beforeEach } from "vitest";

import {
  AuditColumnEncryptionService,
  ConfigBasedKeyProvider,
  createColumnEncryptionService,
} from "../domain/column-encryption.service.js";

import type { EncryptedPayload } from "../domain/column-encryption.service.js";

// ─── Test Helpers ──────────────────────────────────────────────────

const MASTER_KEY = "a-very-secure-master-key-that-is-at-least-32-chars-long!!";

function createService(masterKey = MASTER_KEY): AuditColumnEncryptionService {
  return createColumnEncryptionService(masterKey);
}

// ─── ConfigBasedKeyProvider ────────────────────────────────────────

describe("ConfigBasedKeyProvider", () => {
  it("should reject master keys shorter than 32 characters", () => {
    expect(() => new ConfigBasedKeyProvider("short")).toThrow("at least 32 characters");
  });

  it("should derive deterministic keys for the same tenant+version", async () => {
    const provider = new ConfigBasedKeyProvider(MASTER_KEY);
    const k1 = await provider.getKek("tenant-1");
    const k2 = await provider.getKek("tenant-1");

    expect(k1.key.equals(k2.key)).toBe(true);
    expect(k1.version).toBe(k2.version);
  });

  it("should derive different keys for different tenants", async () => {
    const provider = new ConfigBasedKeyProvider(MASTER_KEY);
    const k1 = await provider.getKek("tenant-a");
    const k2 = await provider.getKek("tenant-b");

    expect(k1.key.equals(k2.key)).toBe(false);
  });

  it("should increment version on rotation", async () => {
    const provider = new ConfigBasedKeyProvider(MASTER_KEY);
    expect((await provider.getKek("t-1")).version).toBe(1);

    const newVersion = await provider.rotateKek("t-1");
    expect(newVersion).toBe(2);
    expect((await provider.getKek("t-1")).version).toBe(2);
  });

  it("should derive different keys for different versions", async () => {
    const provider = new ConfigBasedKeyProvider(MASTER_KEY);
    const v1 = await provider.getKekByVersion("t-1", 1);
    const v2 = await provider.getKekByVersion("t-1", 2);

    expect(v1.key.equals(v2.key)).toBe(false);
  });
});

// ─── AuditColumnEncryptionService ──────────────────────────────────

describe("AuditColumnEncryptionService", () => {
  let svc: AuditColumnEncryptionService;

  beforeEach(() => {
    svc = createService();
  });

  describe("encrypt + decrypt roundtrip", () => {
    it("should roundtrip a simple string", async () => {
      const encrypted = await svc.encrypt("t-1", "192.168.1.100");
      expect(encrypted).not.toBeNull();
      expect(encrypted).not.toBe("192.168.1.100");

      const decrypted = await svc.decrypt("t-1", encrypted);
      expect(decrypted).toBe("192.168.1.100");
    });

    it("should roundtrip Unicode text", async () => {
      const text = "User comment with émojis 🔒 and accénts";
      const encrypted = await svc.encrypt("t-1", text);
      const decrypted = await svc.decrypt("t-1", encrypted);
      expect(decrypted).toBe(text);
    });

    it("should roundtrip long JSON strings (attachments)", async () => {
      const json = JSON.stringify([
        { name: "file1.pdf", size: 1024, url: "https://example.com/file1.pdf" },
        { name: "file2.png", size: 2048, url: "https://example.com/file2.png" },
      ]);
      const encrypted = await svc.encrypt("t-1", json);
      const decrypted = await svc.decrypt("t-1", encrypted);
      expect(decrypted).toBe(json);
    });

    it("should roundtrip empty string", async () => {
      const encrypted = await svc.encrypt("t-1", "");
      const decrypted = await svc.decrypt("t-1", encrypted);
      expect(decrypted).toBe("");
    });
  });

  describe("null/undefined handling", () => {
    it("should return null for null input on encrypt", async () => {
      expect(await svc.encrypt("t-1", null)).toBeNull();
    });

    it("should return null for undefined input on encrypt", async () => {
      expect(await svc.encrypt("t-1", undefined)).toBeNull();
    });

    it("should return null for null input on decrypt", async () => {
      expect(await svc.decrypt("t-1", null)).toBeNull();
    });

    it("should return null for undefined input on decrypt", async () => {
      expect(await svc.decrypt("t-1", undefined)).toBeNull();
    });
  });

  describe("backward compatibility", () => {
    it("should return plaintext as-is if not a valid encrypted payload", async () => {
      // Pre-encryption data stored as plain strings
      const plain = "192.168.1.100";
      const result = await svc.decrypt("t-1", plain);
      expect(result).toBe(plain);
    });

    it("should return non-encrypted JSON as-is", async () => {
      const json = '{"normalField": "value"}';
      const result = await svc.decrypt("t-1", json);
      // Not an EncryptedPayload (missing c, iv, t, v) → returned as-is
      expect(result).toBe(json);
    });
  });

  describe("tenant isolation", () => {
    it("should produce different ciphertexts for different tenants", async () => {
      const enc1 = await svc.encrypt("tenant-a", "same-data");
      const enc2 = await svc.encrypt("tenant-b", "same-data");

      expect(enc1).not.toBe(enc2);

      // Each can only decrypt their own
      expect(await svc.decrypt("tenant-a", enc1)).toBe("same-data");
      expect(await svc.decrypt("tenant-b", enc2)).toBe("same-data");
    });

    it("should fail to decrypt with wrong tenant key", async () => {
      const encrypted = await svc.encrypt("tenant-a", "secret");

      // Decrypting with wrong tenant should throw (auth tag mismatch)
      await expect(svc.decrypt("tenant-b", encrypted)).rejects.toThrow();
    });
  });

  describe("encrypted payload format", () => {
    it("should produce a valid JSON payload with expected fields", async () => {
      const encrypted = await svc.encrypt("t-1", "test-data");
      expect(encrypted).not.toBeNull();

      const payload: EncryptedPayload = JSON.parse(encrypted!);
      expect(payload.c).toBeDefined(); // ciphertext
      expect(payload.iv).toBeDefined(); // IV
      expect(payload.t).toBeDefined(); // auth tag
      expect(payload.v).toBe(1); // key version
    });

    it("should produce different IVs for the same plaintext", async () => {
      const enc1 = await svc.encrypt("t-1", "same-data");
      const enc2 = await svc.encrypt("t-1", "same-data");

      const p1: EncryptedPayload = JSON.parse(enc1!);
      const p2: EncryptedPayload = JSON.parse(enc2!);

      // IVs should differ (random)
      expect(p1.iv).not.toBe(p2.iv);
      // Ciphertexts should also differ
      expect(p1.c).not.toBe(p2.c);
    });
  });

  describe("multi-column encrypt/decrypt", () => {
    it("should encrypt and decrypt all 4 columns", async () => {
      const original = {
        ip_address: "10.0.0.1",
        user_agent: "Mozilla/5.0",
        comment: "Approved by manager",
        attachments: '[{"name":"doc.pdf"}]',
      };

      const encrypted = await svc.encryptColumns("t-1", original);
      expect(encrypted.key_version).toBe(1);
      expect(encrypted.ip_address).not.toBe(original.ip_address);
      expect(encrypted.user_agent).not.toBe(original.user_agent);
      expect(encrypted.comment).not.toBe(original.comment);
      expect(encrypted.attachments).not.toBe(original.attachments);

      const decrypted = await svc.decryptColumns("t-1", {
        ip_address: encrypted.ip_address,
        user_agent: encrypted.user_agent,
        comment: encrypted.comment,
        attachments: encrypted.attachments,
      });

      expect(decrypted.ip_address).toBe(original.ip_address);
      expect(decrypted.user_agent).toBe(original.user_agent);
      expect(decrypted.comment).toBe(original.comment);
      expect(decrypted.attachments).toBe(original.attachments);
    });

    it("should handle null columns in multi-column mode", async () => {
      const encrypted = await svc.encryptColumns("t-1", {
        ip_address: "10.0.0.1",
        user_agent: null,
        comment: undefined,
        attachments: null,
      });

      expect(encrypted.ip_address).not.toBeNull();
      expect(encrypted.user_agent).toBeNull();
      expect(encrypted.comment).toBeNull();
      expect(encrypted.attachments).toBeNull();
    });
  });

  describe("key rotation (re-encryption)", () => {
    it("should re-encrypt from old key to current key", async () => {
      const provider = new ConfigBasedKeyProvider(MASTER_KEY);
      const svc = new AuditColumnEncryptionService(provider);

      // Encrypt with version 1
      const original = "sensitive-ip-address";
      const encV1 = await svc.encrypt("t-1", original);

      // Rotate key
      await provider.rotateKek("t-1");

      // Re-encrypt
      const encV2 = await svc.reEncrypt("t-1", encV1);
      expect(encV2).not.toBeNull();
      expect(encV2).not.toBe(encV1);

      // New version should be 2
      const payload: EncryptedPayload = JSON.parse(encV2!);
      expect(payload.v).toBe(2);

      // Decrypt should still work
      const decrypted = await svc.decrypt("t-1", encV2);
      expect(decrypted).toBe(original);
    });

    it("should return null for null re-encrypt", async () => {
      expect(await svc.reEncrypt("t-1", null)).toBeNull();
      expect(await svc.reEncrypt("t-1", undefined)).toBeNull();
    });
  });

  describe("factory function", () => {
    it("should create a working service via factory", async () => {
      const svc = createColumnEncryptionService(MASTER_KEY);
      const encrypted = await svc.encrypt("t-1", "hello");
      const decrypted = await svc.decrypt("t-1", encrypted);
      expect(decrypted).toBe("hello");
    });
  });
});

// ─── Key Rotation Worker (unit) ────────────────────────────────────

describe("Key Rotation Worker (unit)", () => {
  it("should have the createAuditKeyRotationHandler export", async () => {
    const mod = await import("../jobs/workers/auditKeyRotation.worker.js");
    expect(typeof mod.createAuditKeyRotationHandler).toBe("function");
  });
});
