import { expect, it, vi } from "vitest";
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler, type Transaction } from "kysely";
import { relatedPartnerAuthorizations } from "../business-partner/relationships/authorize-related.js";
import { readBusinessPartner360CommonSection } from "../business-partner/record/section-readers.js";
import { requiredText, optionalText, dateOnly } from "../business-partner/record/row-values.js";

it("batches authorization with a bounded peak and deduplicates counterpart decisions", async () => {
  let active = 0, peak = 0;
  const check = vi.fn(async (id: string) => { active++; peak = Math.max(peak, active); await new Promise(resolve => setTimeout(resolve, 1)); active--; return id !== "denied"; });
  const batch = relatedPartnerAuthorizations(check);
  const ids = Array.from({ length: 26 }, (_, i) => String(i));
  const result = await batch([...ids, "denied", "0"]);
  await batch(["denied", "0"]);
  expect(check).toHaveBeenCalledTimes(27);
  expect(peak).toBe(8);
  expect(result.get("denied")).toBe(false);
});
it("fills authorized network pages across denied candidates and resumes without duplicates", async () => {
  const row = (id: string, target: string) => ({ id, source_business_partner_id: "bp", target_business_partner_id: target, relationship_type_code: "partner", status: "active", created_at: `2026-09-01T00:00:0${id}Z` });
  const batches = [
    [{ id: "owner", code: "business_partner" }], [row("9", "denied"), row("8", "allowed"), row("7", "denied")],
    [row("6", "allowed"), row("5", "allowed"), row("4", "allowed")],
    [{ id: "owner", code: "business_partner" }], [row("5", "allowed"), row("4", "allowed")],
  ];
  const db = new Kysely<Record<string, never>>({ dialect: { createAdapter: () => new PostgresAdapter(), createDriver: () => new DummyDriver(), createIntrospector: db => new PostgresIntrospector(db), createQueryCompiler: () => new PostgresQueryCompiler() }, plugins: [{ transformQuery: args => args.node, transformResult: async args => ({ ...args.result, rows: batches.shift() ?? [] }) }] });
  const input = { tenantId: "tenant", businessPartnerId: "bp", category: "organization" as const, sectionCode: "network" as const, asOf: "2026-09-25", limit: 2, cursor: { snapshotAt: "2026-09-25T00:00:00Z" }, authorizeRelatedPartner: async (id: string) => id !== "denied" };
  try {
    const first = await readBusinessPartner360CommonSection(input, db as unknown as Transaction<Record<string, never>>);
    expect(first.items.map(item => (item as { id: string }).id)).toEqual(["8", "6"]);
    expect(first.next?.id).toBe("6");
    const second = await readBusinessPartner360CommonSection({ ...input, cursor: { ...input.cursor, afterAt: first.next!.at, afterId: first.next!.id } }, db as unknown as Transaction<Record<string, never>>);
    expect(second.items.map(item => (item as { id: string }).id)).toEqual(["5", "4"]);
    expect(second.next).toBeUndefined();
  } finally { await db.destroy(); }
});
it("distinguishes missing required values from nullable fields", () => {
  expect(() => requiredText({ id: null }, "id")).toThrow("FIELD_MISSING");
  expect(optionalText({ id: null }, "id")).toBeUndefined();
  expect(dateOnly("2026-09-25")).toBe("2026-09-25");
  expect(() => dateOnly(null)).toThrow("DATE_MISSING");
});
it("bounds all-denied network scans instead of returning an incomplete success page", async()=>{
  let queries=0;const authorize=vi.fn(async()=>false);
  const db=new Kysely<Record<string,never>>({dialect:{createAdapter:()=>new PostgresAdapter(),createDriver:()=>new DummyDriver(),createIntrospector:db=>new PostgresIntrospector(db),createQueryCompiler:()=>new PostgresQueryCompiler()},plugins:[{transformQuery:args=>args.node,transformResult:async args=>({...args.result,rows:++queries===1?[{id:"owner",code:"business_partner"}]:Array.from({length:101},(_,i)=>({id:`${queries}-${i}`,source_business_partner_id:"bp",target_business_partner_id:`denied-${queries}-${i}`,relationship_type_code:"partner",status:"active",created_at:"2026-09-01T00:00:00Z"}))})}]});
  try {
    await expect(readBusinessPartner360CommonSection({tenantId:"tenant",businessPartnerId:"bp",category:"organization",sectionCode:"network",asOf:"2026-09-25",limit:100,cursor:{snapshotAt:"2026-09-25T00:00:00Z"},authorizeRelatedPartner:authorize},db as unknown as Transaction<Record<string,never>>)).rejects.toMatchObject({status:503,code:"BP_360_RELATIONSHIP_SCAN_LIMIT"});
    expect(authorize.mock.calls.length).toBeLessThanOrEqual(1000);
    expect(queries).toBe(11);
  } finally {await db.destroy();}
});
