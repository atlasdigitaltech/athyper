import { expect, it, vi } from "vitest";
import type { VerifiedToken } from "@athyper/server-contract-auth";
import { createIamConfig, createIamService } from "./index.js";

const token: VerifiedToken = {
  issuer:"https://iam.test/realms/boundary",subject:"verified-subject",audience:["athyper-api"],
  claims:{tenant_id:"tenant",principal_id:"principal",azp:"neon-web",resource_access:{"neon-web":{roles:["AUTHORIZED"]},"mesh-web":{roles:["AUTHORIZED"]}}},
};
const audit = {record:vi.fn(async (input: any) => ({...input,id:"audit",occurredAt:"2026-10-02T00:00:00Z",severity:"info"}))};

it("verifies the bearer token before selecting a plane-local identity authority", async () => {
  const resolveIdentityContext = vi.fn();
  const service = createIamService({tokenVerifier:{verify:async () => {throw Error("invalid signature");}},audit,config:createIamConfig({environment:"production"}),resolveIdentityContext});
  expect(await service.authenticate({token:"forged-token",planeKey:"mesh",requestId:"request"})).toMatchObject({ok:false,status:401,code:"AUTH_TOKEN_INVALID"});
  expect(resolveIdentityContext).not.toHaveBeenCalled();
});

it.each(["off","shadow","enforce"] as const)("rejects a direct API plane request without local admission in %s mode", async claimContextMode => {
  const resolveIdentityContext = vi.fn(async () => undefined);
  const service = createIamService({tokenVerifier:{verify:async () => token},audit,config:createIamConfig({environment:"local",claimContextMode}),resolveIdentityContext});
  expect(await service.authenticate({token:"verified-token",planeKey:"mesh",requestId:"request"})).toMatchObject({ok:false,status:403,code:"AUTH_CONTEXT_MISMATCH"});
  expect(resolveIdentityContext).toHaveBeenCalledWith(expect.objectContaining({planeKey:"mesh",subject:"verified-subject"}));
});

it.each(["off","shadow","enforce"] as const)("makes claim-mismatch rejection explicit for an admitted plane in %s mode", async claimContextMode => {
  const resolveIdentityContext = vi.fn(async () => ({tenantId:"tenant",principalId:"principal",authEpoch:1}));
  const service = createIamService({tokenVerifier:{verify:async () => token},audit,config:createIamConfig({environment:"local",claimContextMode}),resolveIdentityContext});
  const result = await service.authenticate({token:"verified-token",planeKey:"mesh",requestId:"request"});
  if (claimContextMode === "enforce") expect(result).toMatchObject({ok:false,status:403,code:"AUTH_CONTEXT_MISMATCH"});
  else expect(result).toMatchObject({ok:true,context:{planeKey:"mesh",principalId:"principal"}});
});
