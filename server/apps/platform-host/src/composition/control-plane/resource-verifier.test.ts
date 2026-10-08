import { expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { createResourceVerifier } from "./resource-verifier.js";
it("verifies the exact configured public key and rejects other keys or fingerprints", async () => {
  const key = generateKeyPairSync("ed25519");
  const bytes = key.publicKey.export({ format: "der", type: "spki" });
  const value = {
    keyId: "fixture",
    publicKey: bytes.toString("base64"),
    manifest: {
      schema: "athyper.dev-publication-trust/1",
      keys: [
        {
          keyId: "fixture",
          domain: "dev",
          publicKeyFingerprint:
            "sha256:" + createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    },
  };
  const verifier = createResourceVerifier(value);
  const data = Buffer.from("exact-resource");
  const input = {
    keyId: "fixture",
    algorithm: "Ed25519" as const,
    bytes: data,
    signature: sign(null, data, key.privateKey).toString("base64"),
  };
  expect(await verifier.verify(input)).toBe(true);
  expect(
    await verifier.verify({ ...input, bytes: Buffer.from("changed") }),
  ).toBe(false);
  await expect(verifier.verify({ ...input, keyId: "other" })).rejects.toThrow(
    "PUBLICATION_TRUST_KEY_EXCLUDED",
  );
  value.manifest.keys[0]!.publicKeyFingerprint = "sha256:" + "0".repeat(64);
  await expect(createResourceVerifier(value).verify(input)).rejects.toThrow(
    "PUBLICATION_TRUST_FINGERPRINT_MISMATCH",
  );
  expect(() =>
    createResourceVerifier({ ...value, privateKey: "forbidden" }),
  ).toThrow("RESOURCE_TRUST_INVALID");
});
