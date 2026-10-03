import { expect, it } from "vitest";
import { parseReplacementPins, replacementScope } from "./policy-replacement.js";
import { parseHumanReviewedExecutionPolicy } from "./human-publication-policy.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const pin = { id: id(1), hash: "a".repeat(64) };
it("requires explicit unique predecessor pins and excludes the replacement itself", () => {
  expect(parseReplacementPins([pin],id(2))).toEqual([pin]);
  for (const input of [[],[pin,pin],[{...pin,hash:"stale"}],[{...pin,tenantId:id(3)}],[{...pin,id:id(2)}],null])
    expect(() => parseReplacementPins(input,id(2))).toThrow("INPUT_INVALID");
});
it("allows enrollment/build changes but never changed sources, targets or human review", () => {
  const p = parseHumanReviewedExecutionPolicy({schema:"athyper.dev-human-reviewed-publication/1",environment:"local",instance:"dev",authorityTenantId:id(6),
    policyId:"test.first",revision:1,authorPrincipalId:id(3),publisherPrincipalId:id(4),compiler:{name:"test",version:"1",buildHash:"a".repeat(64)},predecessors:[],
    plan:{schema:"athyper.human-reviewed-publication-plan/1",publisherId:id(4),members:[{changeSetId:id(2),entityId:id(1),revision:3,
      contractHash:"b".repeat(64),descriptorHash:"c".repeat(64),sourceReleaseId:null,authorId:id(7),reviewerId:id(8),targets:[{plane:"neon",contractHash:"b".repeat(64),descriptorHash:"c".repeat(64)}]}]}});
  expect(replacementScope({...p,policyId:"test.second",compiler:{...p.compiler,buildHash:"d".repeat(64)}})).toBe(replacementScope(p));
  for (const update of [{authorId:id(9)},{reviewerId:id(9)},{revision:4},{targets:[]},{contractHash:"f".repeat(64)}]) {
    const changed=structuredClone(p);Object.assign(changed.plan.members[0]!,update);
    expect(replacementScope(changed)).not.toBe(replacementScope(p));
  }
});
