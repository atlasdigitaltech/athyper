import type { PublicationSigner, PublicationVerifier } from "@athyper/server-contract-publication";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { CachedPublicationKeyResolver } from "./key-resolver.js";

const ALGORITHM = "Ed25519";

export class Ed25519PublicationSigner implements PublicationSigner {
  constructor(private readonly keys: CachedPublicationKeyResolver) {}

  async sign(input: { readonly keyId: string; readonly algorithm: string; readonly bytes: Uint8Array }): Promise<{ readonly signature: string }> {
    requireEd25519(input.algorithm);
    const key = createPrivateKey({
      key: Buffer.from(await this.keys.signingKey(input.keyId)),
      format: "der",
      type: "pkcs8",
    });
    return { signature: sign(null, input.bytes, key).toString("base64") };
  }
}

export class Ed25519PublicationVerifier implements PublicationVerifier {
  constructor(private readonly keys: CachedPublicationKeyResolver) {}

  async verify(input: { readonly keyId: string; readonly algorithm: string; readonly bytes: Uint8Array; readonly signature: string }): Promise<boolean> {
    requireEd25519(input.algorithm);
    let signature: Buffer;
    try { signature = Buffer.from(input.signature, "base64"); } catch { return false; }
    if (signature.length !== 64) return false;
    const keys = await this.keys.verificationKeys(input.keyId);
    for (const bytes of keys) {
      try {
        const key = createPublicKey({ key: Buffer.from(bytes), format: "der", type: "spki" });
        if (verify(null, input.bytes, key, signature)) return true;
      } catch {
        // A malformed individual overlap key must not prevent checking the remaining trusted keys.
      }
    }
    return false;
  }
}

function requireEd25519(algorithm: string): void {
  if (algorithm !== ALGORITHM) throw new Error(`Unsupported publication signature algorithm: ${algorithm}`);
}
