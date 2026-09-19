import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { contactVerificationSigningBytes, createProviderEvidenceVerifier, parseProviderVerificationKeys, type ProviderVerificationTarget } from "../provider-evidence-verifier.js";
const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const target: ProviderVerificationTarget = { planeKey: "neon", tenantId: "11111111-1111-4111-8111-111111111111", contactId: "22222222-2222-4222-8222-222222222222", channelType: "email", value: "a@example.com", verified: true };
const key = { provider: "provider", keyId: "key-1", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(), planeKeys: ["neon"], tenantIds: [target.tenantId], notBefore: "2026-01-01T00:00:00.000Z", notAfter: "2027-01-01T00:00:00.000Z" };
const fields = { provider: key.provider, keyId: key.keyId, evidenceId: "evidence-1", issuedAt: "2026-09-07T00:00:00.000Z", expiresAt: "2026-09-07T00:05:00.000Z" };
function signed(input = fields, bound = target) {
  const bytes = contactVerificationSigningBytes(input,bound);
  return { ...input, payloadHash: createHash("sha256").update(bytes).digest("hex"), signature: sign(null,bytes,privateKey).toString("base64url") };
}
const verifier = () => createProviderEvidenceVerifier([key], () => new Date("2026-09-07T00:01:00.000Z"));
describe("provider signature protocol v1", () => {
  it("uses the exact versioned signing bytes and validates an authentic Ed25519 signature", async () => {
    expect(contactVerificationSigningBytes(fields,target).toString()).toBe('["athyper.master.contact.verification.v1","neon","11111111-1111-4111-8111-111111111111","22222222-2222-4222-8222-222222222222","email","a@example.com",true,"provider","key-1","evidence-1","2026-09-07T00:00:00.000Z","2026-09-07T00:05:00.000Z"]');
    expect(await verifier().verify(signed(),target)).toBe(true);
  });
  it.each([
    { planeKey: "mesh" }, { tenantId: "33333333-3333-4333-8333-333333333333" }, { contactId: "33333333-3333-4333-8333-333333333333" },
    { channelType: "website" }, { value: "other@example.com" }, { verified: false },
  ])("rejects evidence for a different target %j", async change => {
    expect(await verifier().verify(signed(),{...target,...change} as ProviderVerificationTarget)).toBe(false);
  });
  it.each([
    { provider: "unknown" }, { keyId: "unknown" }, { evidenceId: "changed" }, { issuedAt: "2026-09-07T00:00:01.000Z" },
    { expiresAt: "2026-09-07T00:06:00.000Z" }, { payloadHash: "a".repeat(64) }, { signature: "A".repeat(86) }, { signature: "invalid" },
  ])("rejects altered evidence %j", async change => {
    expect(await verifier().verify({...signed(),...change},target)).toBe(false);
  });
  it("rejects a forged signature even when the attacker recomputes the target hash", async () => {
    const changed = {...target,value:"attacker@example.com"};
    const forged = {...signed(),payloadHash:createHash("sha256").update(contactVerificationSigningBytes(fields,changed)).digest("hex")};
    expect(await verifier().verify(forged,changed)).toBe(false);
  });
  it.each([
    { issuedAt: "2026-09-07T00:02:00.000Z" }, { expiresAt: "2026-09-07T00:01:00.000Z" },
    { expiresAt: "2026-09-07T00:00:00.000Z" }, { expiresAt: "2026-09-07T00:11:00.000Z" },
  ])("rejects even correctly signed invalid validity windows %j", async change => {
    expect(await verifier().verify(signed({...fields,...change}),target)).toBe(false);
  });
  it("requires canonical UTC timestamps and expiration", async () => {
    for (const expiresAt of [undefined, "2026-09-07T00:05:00Z", "2026-02-30T00:00:00.000Z"]) {
      expect(await verifier().verify({...signed(),expiresAt},target)).toBe(false);
    }
  });
  it("enforces key windows, tenant/plane scope and key removal", async () => {
    for (const changed of [{notAfter:"2026-09-07T00:04:00.000Z"},{notBefore:"2026-09-07T00:00:01.000Z"},{tenantIds:["33333333-3333-4333-8333-333333333333"]},{planeKeys:["mesh"]}]) {
      expect(await createProviderEvidenceVerifier([{...key,...changed}],()=>new Date("2026-09-07T00:01:00.000Z")).verify(signed(),target)).toBe(false);
    }
    expect(await createProviderEvidenceVerifier([]).verify(signed(),target)).toBe(false);
  });
  it("supports explicit key rotation", async () => {
    const next = { ...key,keyId:"key-2" };
    const verify = createProviderEvidenceVerifier([key,next],()=>new Date("2026-09-07T00:01:00.000Z"));
    expect(await verify.verify(signed(),target)).toBe(true);
    expect(await verify.verify(signed({...fields,keyId:"key-2"}),target)).toBe(true);
  });
  it("rejects unknown configuration, duplicate identities, private keys and non-Ed25519 keys", () => {
    const rsa = generateKeyPairSync("rsa",{modulusLength:2048}).publicKey.export({type:"spki",format:"pem"}).toString();
    for (const config of [null, {}, [key,key], [{...key,tenantIds:[]}], [{...key,tenantIds:["*"]}], [{...key,algorithm:"none"}], [{...key,publicKeyPem:rsa}], [{...key,publicKeyPem:privateKey.export({type:"pkcs8",format:"pem"}).toString()}]]) {
      expect(()=>parseProviderVerificationKeys(config)).toThrow("Invalid MASTER_DATA_VERIFICATION_KEYS_JSON");
    }
  });
  it("takes a copy of trust configuration", async () => {
    const mutable = {...key,tenantIds:[...key.tenantIds]};
    const verify = createProviderEvidenceVerifier([mutable],()=>new Date("2026-09-07T00:01:00.000Z"));
    mutable.tenantIds.splice(0); mutable.publicKeyPem="bad";
    expect(await verify.verify(signed(),target)).toBe(true);
  });
});
