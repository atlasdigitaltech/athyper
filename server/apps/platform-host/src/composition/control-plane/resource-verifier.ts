import {
  TrustScopedPublicationKeyResolver,
  Ed25519PublicationVerifier,
} from "@athyper/server-adapter-publication-signing";
/** Public verification material only. Trust-domain/fingerprint checks remain in
 * the shared resolver; this binding can never sign resources or control policy. */
export function createResourceVerifier(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("RESOURCE_TRUST_INVALID");
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).sort().join() !== "keyId,manifest,publicKey" ||
    typeof v.keyId !== "string" ||
    !v.keyId ||
    typeof v.publicKey !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(v.publicKey)
  )
    throw Error("RESOURCE_TRUST_INVALID");
  const bytes = Buffer.from(v.publicKey, "base64");
  const resolver = new TrustScopedPublicationKeyResolver(
    {
      async resolve(reference) {
        if (reference !== "resource.public")
          throw Error("RESOURCE_TRUST_INVALID");
        return { bytes, version: "installed" };
      },
    },
    {
      manifest: v.manifest,
      domain: "dev",
      access: "verify",
      keys: [{ keyId: v.keyId, publicKeyReferences: ["resource.public"] }],
    },
  );
  return new Ed25519PublicationVerifier(resolver);
}
