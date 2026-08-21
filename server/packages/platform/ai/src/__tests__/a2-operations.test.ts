import { describe, expect, it, vi } from "vitest";
import type { AtlasCredentialMetadata, AtlasCredentialRepository, AtlasKnowledgeChunkInput, AtlasKnowledgeIndex, AtlasKnowledgeRepository, AtlasKnowledgeSource } from "@athyper/server-contract-ai";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { AtlasCredentialService, AtlasKnowledgeService, KyselyAtlasPolicyAdministration } from "../index.js";

const context: VerifiedRequestContext = {
  planeKey:"neon", realmKey:"neon", tenantId:"10000000-0000-4000-8000-000000000001", principalId:"10000000-0000-4000-8000-000000000002", authEpoch:1, requestId:"r", profileHash:"p",
  permissions:{planeKey:"neon",tenantId:"10000000-0000-4000-8000-000000000001",principalId:"10000000-0000-4000-8000-000000000002",principalFingerprint:"f",profileHash:"p",schemaHash:"s",resolvedAt:1,allowed:[],denied:[],planLocked:[],planeExcluded:[],entries:[],authorizationScopes:[]},
};

describe("A2 credential governance", () => {
  it("encrypts before persistence, advances epoch evidence, invalidates, and exposes no plaintext through administration", async () => {
    let epoch=0; let encrypted=""; const invalidation={publish:vi.fn(async()=>undefined)};
    const repository:AtlasCredentialRepository={rotate:async i=>{encrypted=i.ciphertext.payload;epoch+=1;return meta(epoch,i.ciphertext.keyVersion);},revoke:async()=>({...meta(++epoch,7),status:"revoked",revokedAt:"2026-08-11T00:00:00.000Z"}),readActiveForResolution:async()=>({metadata:meta(epoch,7),encryptedSecret:encrypted}),currentEpoch:async()=>({rotationEpoch:epoch,revoked:false}),health:async()=>({healthy:true})};
    const service=new AtlasCredentialService({repository,cipher:{encrypt:async({plaintext})=>({payload:`cipher:${Buffer.from(plaintext).toString("base64")}`,keyVersion:7}),decrypt:async({ciphertext})=>Buffer.from(ciphertext.slice(7),"base64").toString()},invalidation,createId:()=>"10000000-0000-4000-8000-000000000010",now:()=>new Date("2026-08-11T00:00:00Z")});
    const rotated=await service.createOrRotate({context,providerId:"openai",secret:"provider-secret"});
    expect(rotated).toMatchObject({rotationEpoch:1,keyVersion:7}); expect(encrypted).not.toContain("provider-secret"); expect(invalidation.publish).toHaveBeenCalledWith(expect.objectContaining({rotationEpoch:1})); expect(Object.keys(rotated)).not.toContain("secret");
    const lease=await service.resolveTenant({tenantId:context.tenantId,providerId:"openai",ownerId:"tenant-owner"}); expect(lease?.credentialRevision).toBe("epoch:1:key:7");
  });
});

describe("A2 knowledge governance", () => {
  it("persists only hashes/locators, requires index acknowledgement, and retracts from the index", async () => {
    const source:AtlasKnowledgeSource={id:"10000000-0000-4000-8000-000000000020",tenantId:context.tenantId,sourceKind:"document",sourceId:"doc-1",permissionCode:"documents.read",status:"active",createdAt:"2026-08-11T00:00:00Z"}; let persisted="";
    const repository:AtlasKnowledgeRepository={registerSource:async()=>source,beginRevision:async i=>{persisted=JSON.stringify(i);return{revisionId:i.revisionId,replayed:false,source};},markReady:vi.fn(async()=>undefined),markFailed:vi.fn(async()=>undefined),retract:async()=>["10000000-0000-4000-8000-000000000021"],health:async()=>({healthy:true})};
    const index:AtlasKnowledgeIndex={index:vi.fn(async i=>i.chunks.map((c:AtlasKnowledgeChunkInput)=>({ordinal:c.ordinal,indexReference:`v:${c.contentHash}`,embeddingModel:"embed-1"}))),search:vi.fn(async()=>[]),remove:vi.fn(async()=>undefined),health:async()=>({healthy:true})};
    let id=20; const service=new AtlasKnowledgeService({repository,index,chunkCharacters:256,createId:()=>`10000000-0000-4000-8000-${String(++id).padStart(12,"0")}`,now:()=>new Date("2026-08-11T00:00:00Z")});
    await service.ingest({context,sourceId:"doc-1",sourceVersionId:"v1",text:"secret knowledge ".repeat(40)}); expect(persisted).not.toContain("secret knowledge"); expect(persisted).toMatch(/[0-9a-f]{64}/); expect(repository.markReady).toHaveBeenCalledOnce();
    await service.retract({context,sourceId:"doc-1"}); expect(index.remove).toHaveBeenCalledWith(expect.objectContaining({tenantId:context.tenantId}));
  });
});

describe("A2 policy safety",()=>{it("does not permit an auto policy without human confirmation",async()=>{const admin=new KyselyAtlasPolicyAdministration({transactions:{} as never,invalidation:{publish:vi.fn()}});await expect(admin.putActionPolicy({context,policy:{actionCode:"finance.invoice.post",docClass:null,autonomyLevel:"auto",minConfidenceForAuto:.95,requiresHumanConfirmation:false}})).rejects.toThrow(/not qualified/);});});
function meta(rotationEpoch:number,keyVersion:number):AtlasCredentialMetadata{return{credentialId:"10000000-0000-4000-8000-000000000010",providerId:"openai",rotationEpoch,keyVersion,status:"active",activatedAt:"2026-08-11T00:00:00.000Z"};}
