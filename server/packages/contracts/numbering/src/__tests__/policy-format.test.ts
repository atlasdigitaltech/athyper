import { describe, expect, it } from "vitest";
import { formatNumber, NumberingError, type NumberingPolicy } from "../index.js";

const policy: NumberingPolicy = { id:"019fc300-0000-7000-8000-000000000001",policyCode:"invoice",policyRevision:1,formatTemplate:"INV-{yyyy}-{ctx.company}-{seq}",sequenceWidth:5,padCharacter:"0",startValue:1,incrementBy:1,scopeKind:"tenant",resetKind:"calendar_year",timezoneCode:"UTC",source:"global" };
describe("formatNumber",()=>{
  it("formats deterministic tenant numbering",()=>expect(formatNumber(policy,{nextValue:42,occurredAt:"2026-08-09T00:00:00Z",tenantId:"tenant-1",contextFields:{company:"MY"}})).toMatchObject({formattedNumber:"INV-2026-MY-00042",resetBucket:"2026",followingValue:43,scopeKey:"tenant-1"}));
  it("requires fiscal-year evidence",()=>expect(()=>formatNumber({...policy,resetKind:"fiscal_year"},{nextValue:1,occurredAt:"2026-08-09T00:00:00Z",tenantId:"tenant-1",contextFields:{company:"MY"}})).toThrowError(NumberingError));
  it("rejects templates without exactly one sequence token",()=>expect(()=>formatNumber({...policy,formatTemplate:"INV-{yyyy}"},{nextValue:1,occurredAt:"2026-08-09T00:00:00Z",tenantId:"tenant-1"})).toThrowError(/exactly one/));
});
