import { createPublicKey, verify } from "node:crypto";

export interface ProviderVerificationKey {
  readonly provider: string;
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly planeKeys: readonly string[];
  readonly tenantIds: readonly string[];
  readonly notBefore: string;
  readonly notAfter: string;
}
const token = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const instant = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
function invalid(): never { throw new Error("INVALID_PROVIDER_VERIFICATION_KEYS"); }

/** Trusted operator configuration only. No key discovery from request data. */
export function parseProviderVerificationKeys(value: unknown): readonly ProviderVerificationKey[] {
  if (!Array.isArray(value) || value.length > 100) invalid();
  const seen = new Set<string>();
  return value.map(item => {
    if (!item || typeof item !== "object" || Array.isArray(item)) invalid();
    const key = item as Record<string, unknown>;
    if (Object.keys(key).some(name => !["provider", "keyId", "publicKeyPem", "planeKeys", "tenantIds", "notBefore", "notAfter"].includes(name))) invalid();
    if (typeof key.provider !== "string" || !token.test(key.provider) || typeof key.keyId !== "string" || !token.test(key.keyId) ||
        typeof key.publicKeyPem !== "string" || key.publicKeyPem.length > 4096 || !key.publicKeyPem.startsWith("-----BEGIN PUBLIC KEY-----") ||
        !Array.isArray(key.planeKeys) || !key.planeKeys.length || !key.planeKeys.every(p => ["studio", "neon", "mesh"].includes(p)) ||
        !Array.isArray(key.tenantIds) || !key.tenantIds.length || key.tenantIds.length > 10000 || !key.tenantIds.every(t => typeof t === "string" && uuid.test(t)) ||
        !instant(key.notBefore) || !instant(key.notAfter) || Date.parse(key.notBefore) >= Date.parse(key.notAfter)) invalid();
    const identity = JSON.stringify([key.provider, key.keyId]);
    if (seen.has(identity)) invalid();
    seen.add(identity);
    try { if (createPublicKey(key.publicKeyPem).asymmetricKeyType !== "ed25519") invalid(); } catch { invalid(); }
    return Object.freeze({ provider: key.provider, keyId: key.keyId, publicKeyPem: key.publicKeyPem,
      planeKeys: Object.freeze([...key.planeKeys]), tenantIds: Object.freeze(key.tenantIds.map(t => t.toLowerCase())),
      notBefore: key.notBefore, notAfter: key.notAfter });
  });
}

/** Cryptographic primitive only. The domain adapter must construct canonical bytes
 * binding the target, identity, scope, timestamps and evidence ID, and enforce replay policy.
 */
export function createProviderSignatureVerifier(configuration: unknown) {
  const keys = parseProviderVerificationKeys(configuration).map(config => ({ config, key: createPublicKey(config.publicKeyPem) }));
  return (input: { provider: string; keyId: string; planeKey: string; tenantId: string; issuedAt: string; expiresAt: string; signature: string; payload: Uint8Array; now?: Date }): boolean => {
    try {
      const entry = keys.find(item => item.config.provider === input.provider && item.config.keyId === input.keyId);
      if (!entry || !entry.config.planeKeys.includes(input.planeKey) || !entry.config.tenantIds.includes(input.tenantId.toLowerCase()) ||
          !instant(input.issuedAt) || !instant(input.expiresAt) || !/^[A-Za-z0-9_-]{86}$/.test(input.signature)) return false;
      const now = (input.now ?? new Date()).getTime(), issued = Date.parse(input.issuedAt), expires = Date.parse(input.expiresAt);
      if (!Number.isFinite(now) || issued > now || expires <= now || expires <= issued || expires - issued > 600000 ||
          issued < Date.parse(entry.config.notBefore) || expires > Date.parse(entry.config.notAfter) || now >= Date.parse(entry.config.notAfter)) return false;
      const signature = Buffer.from(input.signature, "base64url");
      return signature.length === 64 && signature.toString("base64url") === input.signature && verify(null, input.payload, entry.key, signature);
    } catch { return false; }
  };
}
