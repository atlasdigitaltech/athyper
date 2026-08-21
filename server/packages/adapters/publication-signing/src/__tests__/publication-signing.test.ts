import type { SecretStore } from "@athyper/server-contract-secrets";
import { describe, expect, it, vi } from "vitest";
import { canonicalBytes, canonicalJson, CachedPublicationKeyResolver, Ed25519PublicationSigner, Ed25519PublicationVerifier, sha256 } from "../index.js";

const PRIVATE_DER = bytes("302e020100300506032b6570042204209d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60");
const PUBLIC_DER = bytes("302a300506032b6570032100d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a");
const RFC_SIGNATURE = "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";

describe("Publication signing adapter", () => {
  it("matches the frozen canonical bytes and hash vector", () => {
    const value = { n: -0, b: [3, 2, 1], a: "é" };
    expect(canonicalJson(value)).toBe('{"a":"é","b":[3,2,1],"n":0}');
    expect(Buffer.from(canonicalBytes(value)).toString("hex")).toBe("7b2261223a22c3a9222c2262223a5b332c322c315d2c226e223a307d");
    expect(sha256(canonicalBytes(value))).toBe("cb3ee643229e4e76e4a55dac02d47f09e9f81d9762a8454b88ff27c61e4b40a7");
  });

  it("rejects values outside the JSON data model", () => {
    expect(() => canonicalBytes({ value: undefined })).toThrow("cannot encode undefined");
    expect(() => canonicalBytes(Number.NaN)).toThrow("non-finite");
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => canonicalBytes(cyclic)).toThrow("cyclic");
  });

  it("matches RFC 8032 Ed25519 test vector 1", async () => {
    const { signer, verifier } = adapters(secretStore({ private: PRIVATE_DER, public: PUBLIC_DER }));
    const signed = await signer.sign({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: new Uint8Array() });
    expect(Buffer.from(signed.signature, "base64").toString("hex")).toBe(RFC_SIGNATURE);
    await expect(verifier.verify({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: new Uint8Array(), signature: signed.signature })).resolves.toBe(true);
  });

  it("fails closed for tampering, a wrong key, and a wrong algorithm", async () => {
    const first = adapters(secretStore({ private: PRIVATE_DER, public: PUBLIC_DER }));
    const signature = (await first.signer.sign({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(1) })).signature;
    await expect(first.verifier.verify({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(2), signature })).resolves.toBe(false);
    const wrong = adapters(secretStore({ private: PRIVATE_DER, public: bytes("302a300506032b65700321001111111111111111111111111111111111111111111111111111111111111111") }));
    await expect(wrong.verifier.verify({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(1), signature })).resolves.toBe(false);
    await expect(first.verifier.verify({ keyId: "rfc8032-1", algorithm: "RS256", bytes: Uint8Array.of(1), signature })).rejects.toThrow("Unsupported");
  });

  it("caches key resolution by TTL and accepts overlap verification keys", async () => {
    let now = 0;
    const store = secretStore({ private: PRIVATE_DER, public: PUBLIC_DER, previous: bytes("302a300506032b65700321001111111111111111111111111111111111111111111111111111111111111111") });
    const resolver = new CachedPublicationKeyResolver(store, [{ keyId: "rfc8032-1", privateKeyReference: "private", publicKeyReferences: ["previous", "public"] }], 100, () => now);
    const signer = new Ed25519PublicationSigner(resolver);
    const verifier = new Ed25519PublicationVerifier(resolver);
    const signature = (await signer.sign({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(1) })).signature;
    await expect(verifier.verify({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(1), signature })).resolves.toBe(true);
    await verifier.verify({ keyId: "rfc8032-1", algorithm: "Ed25519", bytes: Uint8Array.of(1), signature });
    expect(store.resolve).toHaveBeenCalledTimes(3);
    now = 101;
    await resolver.verificationKeys("rfc8032-1");
    expect(store.resolve).toHaveBeenCalledTimes(5);
    await expect(resolver.health("rfc8032-1", true)).resolves.toEqual({ healthy: true });
  });
});

function adapters(store: SecretStore) {
  const resolver = new CachedPublicationKeyResolver(store, [{ keyId: "rfc8032-1", privateKeyReference: "private", publicKeyReferences: ["public"] }]);
  return { signer: new Ed25519PublicationSigner(resolver), verifier: new Ed25519PublicationVerifier(resolver) };
}

function secretStore(values: Record<string, Uint8Array>): SecretStore & { resolve: ReturnType<typeof vi.fn> } {
  return { resolve: vi.fn(async (reference: string) => ({ bytes: values[reference] ?? new Uint8Array(), version: "1" })) };
}

function bytes(hex: string): Uint8Array { return Buffer.from(hex, "hex"); }
