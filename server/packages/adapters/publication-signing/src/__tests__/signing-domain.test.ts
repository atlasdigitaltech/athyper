import { createHash, generateKeyPairSync } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { TrustScopedPublicationKeyResolver, parsePublicationTrustManifest, Ed25519PublicationSigner, Ed25519PublicationVerifier } from "../index.js";
function key() {
  const pair = generateKeyPairSync("ed25519");
  const publicBytes = pair.publicKey.export({ type: "spki", format: "der" });
  return { publicBytes, privateBytes: pair.privateKey.export({ type: "pkcs8", format: "der" }), fingerprint: `sha256:${createHash("sha256").update(publicBytes).digest("hex")}` };
}
function fixture() {
  const dev = key(), prod = key();
  const manifest = { schema: "athyper.publication-trust/1", keys: [
    { keyId: "dev-1", domain: "dev", publicKeyFingerprint: dev.fingerprint },
    { keyId: "prod-1", domain: "production", publicKeyFingerprint: prod.fingerprint },
  ] };
  const values: Record<string, Uint8Array> = { "dev-public": dev.publicBytes, "dev-private": dev.privateBytes, "prod-public": prod.publicBytes, "prod-private": prod.privateBytes };
  const store = { resolve: vi.fn(async (ref: string) => ({ bytes: values[ref]!, version: "1" })) };
  const devResolver = new TrustScopedPublicationKeyResolver(store, { manifest, domain: "dev", access: "sign_and_verify", keys: [{ keyId: "dev-1", privateKeyReference: "dev-private", publicKeyReferences: ["dev-public"] }] });
  const prodResolver = new TrustScopedPublicationKeyResolver(store, { manifest, domain: "production", access: "verify", keys: [{ keyId: "prod-1", publicKeyReferences: ["prod-public"] }] });
  return { dev, prod, manifest, values, store, devResolver, prodResolver };
}
describe("cryptographic publication trust separation", () => {
  it("allows an explicitly local-only manifest without inventing a production key", async () => {
    const f = fixture();
    const manifest = { schema: "athyper.dev-publication-trust/1", keys: [f.manifest.keys[0]] };
    const resolver = new TrustScopedPublicationKeyResolver(f.store, { manifest, domain: "dev", access: "sign_and_verify", keys: [{ keyId: "dev-1", publicKeyReferences: ["dev-public"], privateKeyReference: "dev-private" }] });
    const bytes = Buffer.from("local publication");
    const { signature } = await new Ed25519PublicationSigner(resolver).sign({ keyId: "dev-1", algorithm: "Ed25519", bytes });
    await expect(new Ed25519PublicationVerifier(resolver).verify({ keyId: "dev-1", algorithm: "Ed25519", bytes, signature })).resolves.toBe(true);
    f.store.resolve.mockClear();
    expect(() => new TrustScopedPublicationKeyResolver(f.store, { manifest, domain: "production", access: "verify", keys: [{ keyId: "dev-1", publicKeyReferences: ["dev-public"] }] })).toThrow("DOMAIN_EXCLUDED");
    expect(f.store.resolve).not.toHaveBeenCalled();
    expect(() => parsePublicationTrustManifest({ ...manifest, keys: [f.manifest.keys[1]] })).toThrow("SEPARATION_REQUIRED");
    expect(() => parsePublicationTrustManifest({ ...manifest, keys: [] })).toThrow();
  });
  it("rejects a real DEV signature in production even with a forged production key ID", async () => {
    const f = fixture(); const bytes = Buffer.from("identical content, independent trust");
    const { signature } = await new Ed25519PublicationSigner(f.devResolver).sign({ keyId: "dev-1", algorithm: "Ed25519", bytes });
    await expect(new Ed25519PublicationVerifier(f.devResolver).verify({ keyId: "dev-1", algorithm: "Ed25519", bytes, signature })).resolves.toBe(true);
    f.store.resolve.mockClear();
    const verifier = new Ed25519PublicationVerifier(f.prodResolver);
    await expect(verifier.verify({ keyId: "dev-1", algorithm: "Ed25519", bytes, signature })).rejects.toThrow("KEY_EXCLUDED");
    expect(f.store.resolve).not.toHaveBeenCalled();
    await expect(verifier.verify({ keyId: "prod-1", algorithm: "Ed25519", bytes, signature })).resolves.toBe(false);
    expect(f.store.resolve.mock.calls.map(call => call[0])).toEqual(["prod-public"]);
  });
  it("accepts production signatures only with the pinned production material", async () => {
    const f = fixture(); const resolver = new TrustScopedPublicationKeyResolver(f.store, { manifest: f.manifest, domain: "production", access: "sign_and_verify", keys: [{ keyId: "prod-1", privateKeyReference: "prod-private", publicKeyReferences: ["prod-public"] }] });
    const bytes = Buffer.from("production");
    const { signature } = await new Ed25519PublicationSigner(resolver).sign({ keyId: "prod-1", algorithm: "Ed25519", bytes });
    await expect(new Ed25519PublicationVerifier(f.prodResolver).verify({ keyId: "prod-1", algorithm: "Ed25519", bytes, signature })).resolves.toBe(true);
  });
  it("rejects shared material hidden behind different IDs", () => {
    const f = fixture(); f.manifest.keys[1]!.publicKeyFingerprint = f.dev.fingerprint;
    expect(() => parsePublicationTrustManifest(f.manifest)).toThrow("KEY_REUSE");
  });
  it("rejects foreign domain references and private credentials in verification-only mode", () => {
    const f = fixture();
    expect(() => new TrustScopedPublicationKeyResolver(f.store, { manifest: f.manifest, domain: "production", access: "verify", keys: [{ keyId: "dev-1", publicKeyReferences: ["dev-public"] }] })).toThrow("DOMAIN_EXCLUDED");
    expect(() => new TrustScopedPublicationKeyResolver(f.store, { manifest: f.manifest, domain: "production", access: "verify", keys: [{ keyId: "prod-1", privateKeyReference: "prod-private", publicKeyReferences: ["prod-public"] }] })).toThrow("ACCESS_INVALID");
    expect(f.store.resolve).not.toHaveBeenCalled();
  });
  it("never resolves private material for a verifier", async () => {
    const f = fixture(); await expect(f.prodResolver.signingKey("prod-1")).rejects.toThrow("SIGNING_FORBIDDEN");
    expect(f.store.resolve).not.toHaveBeenCalled();
  });
  it("rejects a secret alias pointing to the wrong public or private key", async () => {
    const f = fixture(); f.values["prod-public"] = f.dev.publicBytes;
    await expect(f.prodResolver.verificationKeys("prod-1")).rejects.toThrow("FINGERPRINT_MISMATCH");
    f.values["dev-private"] = f.prod.privateBytes;
    await expect(f.devResolver.signingKey("dev-1")).rejects.toThrow("FINGERPRINT_MISMATCH");
  });
  it("checks expiry and gives health callers no secret details", async () => {
    const f = fixture(); const resolver = new TrustScopedPublicationKeyResolver({ resolve: async () => ({ bytes: f.dev.publicBytes, version: "1", expiresAt: "2020-01-01T00:00:00Z" }) }, { manifest: f.manifest, domain: "dev", access: "verify", keys: [{ keyId: "dev-1", publicKeyReferences: ["dev-public"] }] });
    await expect(resolver.verificationKeys("dev-1")).rejects.toThrow("KEY_EXPIRED");
    await expect(resolver.health("dev-1", false)).resolves.toEqual({ healthy: false, message: "Publication trust qualification failed" });
  });
  it("rejects missing domains, unknown versions and duplicate IDs", () => {
    const f = fixture();
    expect(() => parsePublicationTrustManifest({ ...f.manifest, schema: "unknown" })).toThrow();
    expect(() => parsePublicationTrustManifest({ ...f.manifest, keys: [f.manifest.keys[0]] })).toThrow();
    f.manifest.keys[1]!.keyId = "dev-1";
    expect(() => parsePublicationTrustManifest(f.manifest)).toThrow("KEY_REUSE");
  });
});
