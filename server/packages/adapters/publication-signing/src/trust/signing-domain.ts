import { createHash, createPrivateKey, createPublicKey, type KeyObject } from "node:crypto";
import type { SecretStore } from "@athyper/server-contract-secrets";
import type { PublicationKeyConfiguration } from "../key-resolver.js";

export type PublicationTrustDomain = "dev" | "production";
export interface PublicationTrustManifest {
  readonly schema: "athyper.publication-trust/1" | "athyper.dev-publication-trust/1";
  readonly keys: readonly { readonly keyId: string; readonly domain: PublicationTrustDomain; readonly publicKeyFingerprint: string }[];
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PUBLICATION_TRUST_SHAPE_INVALID");
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key))) throw Error("PUBLICATION_TRUST_KEYS_INVALID");
  return row;
}
export function parsePublicationTrustManifest(value: unknown): PublicationTrustManifest {
  const row = exact(value, ["schema", "keys"]);
  const developmentOnly = row.schema === "athyper.dev-publication-trust/1";
  if ((!developmentOnly && row.schema !== "athyper.publication-trust/1") || !Array.isArray(row.keys) || row.keys.length < (developmentOnly ? 1 : 2) || row.keys.length > 100) throw Error("PUBLICATION_TRUST_MANIFEST_INVALID");
  const keys = Array.from(row.keys).map(value => {
    const key = exact(value, ["keyId", "domain", "publicKeyFingerprint"]);
    if (typeof key.keyId !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,126}$/.test(key.keyId)
      || (key.domain !== "dev" && key.domain !== "production")
      || typeof key.publicKeyFingerprint !== "string" || !/^sha256:[a-f0-9]{64}$/.test(key.publicKeyFingerprint)) throw Error("PUBLICATION_TRUST_KEY_INVALID");
    return Object.freeze({ keyId: key.keyId, domain: key.domain, publicKeyFingerprint: key.publicKeyFingerprint });
  });
  if (new Set(keys.map(k => k.keyId)).size !== keys.length || new Set(keys.map(k => k.publicKeyFingerprint)).size !== keys.length) throw Error("PUBLICATION_TRUST_KEY_REUSE");
  if (developmentOnly ? keys.some(k => k.domain !== "dev") : (!keys.some(k => k.domain === "dev") || !keys.some(k => k.domain === "production"))) throw Error("PUBLICATION_TRUST_SEPARATION_REQUIRED");
  return Object.freeze({ schema: row.schema as PublicationTrustManifest["schema"], keys: Object.freeze(keys) });
}
function fingerprint(key: KeyObject): string {
  if (key.asymmetricKeyType !== "ed25519") throw Error("PUBLICATION_TRUST_ED25519_REQUIRED");
  return `sha256:${createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex")}`;
}

/** Strict opt-in resolver. Manifest fingerprints are public, reviewed trust policy.
 * Local secret references never include another domain. Secret-store ACLs must
 * independently enforce this boundary; this adapter cannot configure provider IAM.
 * Every resolution validates expiry and canonical public-key identity, with no cache.
 */
export class TrustScopedPublicationKeyResolver {
  private readonly entries = new Map<string, PublicationKeyConfiguration & { publicKeyFingerprint: string }>();
  private readonly canSign: boolean;
  constructor(private readonly secrets: SecretStore, options: {
    readonly manifest: unknown;
    readonly domain: PublicationTrustDomain;
    readonly access: "verify" | "sign_and_verify";
    readonly keys: readonly PublicationKeyConfiguration[];
  }, private readonly now: () => number = Date.now) {
    const manifest = parsePublicationTrustManifest(options.manifest);
    if (manifest.schema === "athyper.dev-publication-trust/1" && options.domain !== "dev") throw Error("PUBLICATION_TRUST_DOMAIN_EXCLUDED");
    if (!["dev", "production"].includes(options.domain) || !["verify", "sign_and_verify"].includes(options.access)) throw Error("PUBLICATION_TRUST_MODE_INVALID");
    this.canSign = options.access === "sign_and_verify";
    if (!options.keys.length) throw Error("PUBLICATION_TRUST_LOCAL_KEYS_REQUIRED");
    for (const input of options.keys) {
      const key = manifest.keys.find(k => k.keyId === input.keyId && k.domain === options.domain);
      if (!key || this.entries.has(input.keyId)) throw Error("PUBLICATION_TRUST_DOMAIN_EXCLUDED");
      if (!Array.isArray(input.publicKeyReferences) || !input.publicKeyReferences.length
        || Array.from(input.publicKeyReferences).some(ref => typeof ref !== "string" || !ref.trim())
        || (input.privateKeyReference !== undefined && (typeof input.privateKeyReference !== "string" || !input.privateKeyReference.trim()))
        || (!this.canSign && input.privateKeyReference !== undefined)) throw Error("PUBLICATION_TRUST_ACCESS_INVALID");
      this.entries.set(input.keyId, Object.freeze({ ...input, publicKeyReferences: Object.freeze([...input.publicKeyReferences]), publicKeyFingerprint: key.publicKeyFingerprint }));
    }
  }
  private requireKey(keyId: string) {
    const key = this.entries.get(keyId);
    if (!key) throw Error("PUBLICATION_TRUST_KEY_EXCLUDED");
    return key;
  }
  private async resolve(reference: string): Promise<Uint8Array> {
    const result = await this.secrets.resolve(reference);
    if (result.expiresAt !== undefined && (!Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= this.now())) throw Error("PUBLICATION_TRUST_KEY_EXPIRED");
    return Uint8Array.from(result.bytes);
  }
  async signingKey(keyId: string): Promise<Uint8Array> {
    if (!this.canSign) throw Error("PUBLICATION_TRUST_SIGNING_FORBIDDEN");
    const config = this.requireKey(keyId);
    if (!config.privateKeyReference) throw Error("PUBLICATION_TRUST_PRIVATE_KEY_UNAVAILABLE");
    const bytes = await this.resolve(config.privateKeyReference);
    const publicKey = createPublicKey(createPrivateKey({ key: Buffer.from(bytes), format: "der", type: "pkcs8" }));
    if (fingerprint(publicKey) !== config.publicKeyFingerprint) throw Error("PUBLICATION_TRUST_FINGERPRINT_MISMATCH");
    return bytes;
  }
  async verificationKeys(keyId: string): Promise<readonly Uint8Array[]> {
    const config = this.requireKey(keyId);
    const keys = await Promise.all(config.publicKeyReferences.map(ref => this.resolve(ref)));
    for (const bytes of keys) {
      if (fingerprint(createPublicKey({ key: Buffer.from(bytes), format: "der", type: "spki" })) !== config.publicKeyFingerprint) throw Error("PUBLICATION_TRUST_FINGERPRINT_MISMATCH");
    }
    return keys;
  }
  async health(keyId: string, requireSigningKey: boolean) {
    try {
      await this.verificationKeys(keyId);
      if (requireSigningKey) await this.signingKey(keyId);
      return { healthy: true };
    } catch { return { healthy: false, message: "Publication trust qualification failed" }; }
  }
}
