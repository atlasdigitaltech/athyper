import { createHash, createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";
import type { ContactChannel, SignedProviderEvidence } from "@athyper/server-contract-master-data";
import type { ProviderEvidenceVerifier } from "./services.js";
import { optionalTimestamp } from "./validation.js";

export interface ProviderVerificationTarget {
  readonly planeKey: string;
  readonly tenantId: string;
  readonly contactId: string;
  readonly channelType: ContactChannel;
  readonly value: string;
  readonly verified: boolean;
}
export interface ProviderVerificationKey {
  readonly provider: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly planeKeys: readonly string[];
  readonly tenantIds: readonly string[];
  readonly notBefore: string;
  readonly notAfter: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const token = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const planes = ["studio", "neon", "mesh"];
const channels = ["email", "phone", "fax", "sms", "whatsapp", "website"];
export const CONTACT_VERIFICATION_MAX_AGE_MS = 10 * 60 * 1000;

/** Versioned fixed-position JSON array: UTF-8, no whitespace, no Unicode normalization. */
export function contactVerificationSigningBytes(evidence: Pick<SignedProviderEvidence, "provider" | "keyId" | "evidenceId" | "issuedAt" | "expiresAt">, target: ProviderVerificationTarget): Buffer {
  if (typeof evidence.provider !== "string" || !token.test(evidence.provider) || typeof evidence.keyId !== "string" || !token.test(evidence.keyId) || typeof evidence.evidenceId !== "string" || !token.test(evidence.evidenceId)
      || !uuid.test(target.tenantId) || !uuid.test(target.contactId) || !planes.includes(target.planeKey)
      || !channels.includes(target.channelType) || typeof target.value !== "string" || !target.value || target.value.length > 4096
      || typeof target.verified !== "boolean" || !canonicalInstant(evidence.issuedAt) || !canonicalInstant(evidence.expiresAt)) {
    throw new Error("Invalid contact verification payload");
  }
  return Buffer.from(JSON.stringify([
    "athyper.master.contact.verification.v1", target.planeKey, target.tenantId.toLowerCase(), target.contactId.toLowerCase(),
    target.channelType, target.value, target.verified, evidence.provider, evidence.keyId, evidence.evidenceId, evidence.issuedAt, evidence.expiresAt,
  ]), "utf8");
}

/** Configuration is trusted operator input; request data can never introduce keys or URLs. */
export function parseProviderVerificationKeys(value: unknown): readonly ProviderVerificationKey[] {
  if (!Array.isArray(value) || value.length > 100) invalidConfig();
  const seen = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalidConfig();
    const key = item as Record<string, unknown>;
    if (Object.keys(key).some(name => !["provider", "keyId", "publicKeyPem", "planeKeys", "tenantIds", "notBefore", "notAfter"].includes(name))) invalidConfig();
    if (typeof key.provider !== "string" || !token.test(key.provider) || typeof key.keyId !== "string" || !token.test(key.keyId)
        || typeof key.publicKeyPem !== "string" || key.publicKeyPem.length > 4096 || !key.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----")
        || !Array.isArray(key.planeKeys) || !key.planeKeys.length || !key.planeKeys.every(p => typeof p === "string" && planes.includes(p))
        || !Array.isArray(key.tenantIds) || !key.tenantIds.length || key.tenantIds.length > 10000 || !key.tenantIds.every(t => typeof t === "string" && uuid.test(t))
        || !canonicalInstant(key.notBefore) || !canonicalInstant(key.notAfter) || Date.parse(key.notBefore as string) >= Date.parse(key.notAfter as string)) invalidConfig();
    const id = JSON.stringify([key.provider, key.keyId]);
    if (seen.has(id)) invalidConfig();
    seen.add(id);
    try { if (createPublicKey(key.publicKeyPem).asymmetricKeyType !== "ed25519") invalidConfig(); } catch { invalidConfig(); }
    return { provider: key.provider, keyId: key.keyId, publicKeyPem: key.publicKeyPem, planeKeys: [...key.planeKeys], tenantIds: key.tenantIds.map(t => (t as string).toLowerCase()), notBefore: key.notBefore as string, notAfter: key.notAfter as string };
  });
}

export function createProviderEvidenceVerifier(keys: readonly ProviderVerificationKey[], now: () => Date = () => new Date()): ProviderEvidenceVerifier {
  const trusted = new Map<string, { config: ProviderVerificationKey; key: KeyObject }>();
  for (const config of parseProviderVerificationKeys(keys)) trusted.set(JSON.stringify([config.provider, config.keyId]), { config, key: createPublicKey(config.publicKeyPem) });
  return {
    async verify(evidence, target) {
      try {
        const entry = trusted.get(JSON.stringify([evidence.provider, evidence.keyId]));
        if (!entry || !entry.config.planeKeys.includes(target.planeKey) || !entry.config.tenantIds.includes(target.tenantId.toLowerCase())) return false;
        const bytes = contactVerificationSigningBytes(evidence, target);
        const issued = Date.parse(evidence.issuedAt), expires = Date.parse(evidence.expiresAt!), current = now().getTime();
        if (!Number.isFinite(current) || issued > current || expires <= current || expires <= issued || expires - issued > CONTACT_VERIFICATION_MAX_AGE_MS
            || issued < Date.parse(entry.config.notBefore) || expires > Date.parse(entry.config.notAfter) || current >= Date.parse(entry.config.notAfter)) return false;
        if (typeof evidence.payloadHash !== "string" || !/^[a-f0-9]{64}$/u.test(evidence.payloadHash) || createHash("sha256").update(bytes).digest("hex") !== evidence.payloadHash) return false;
        if (typeof evidence.signature !== "string" || !/^[A-Za-z0-9_-]{86}$/u.test(evidence.signature)) return false;
        const signature = Buffer.from(evidence.signature, "base64url");
        if (signature.length !== 64 || signature.toString("base64url") !== evidence.signature) return false;
        return verifySignature(null, bytes, entry.key, signature);
      } catch { return false; }
    },
  };
}
function canonicalInstant(value: unknown): value is string {
  try { return typeof value === "string" && optionalTimestamp(value) !== undefined && new Date(value).toISOString() === value; } catch { return false; }
}
function invalidConfig(): never { throw new Error("Invalid MASTER_DATA_VERIFICATION_KEYS_JSON: expected unique scoped Ed25519 public keys with valid UTC key windows"); }
