import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("finance implementation import boundary",()=>{
  it("is imported by Neon and never by Studio or Mesh",async()=>{const root=resolve(import.meta.dirname,"../../../../..");const [studio,mesh,neon]=await Promise.all([readFile(resolve(root,"packages/planes/studio/src/index.ts"),"utf8"),readFile(resolve(root,"packages/planes/mesh/src/index.ts"),"utf8"),readFile(resolve(root,"packages/planes/neon/src/index.ts"),"utf8")]);for(const source of [studio,mesh])expect(source).not.toMatch(/server-service-finance|register-finance/);expect(neon).toContain("register-finance");});
  it("registers routes, durable handlers, definitions, and all readiness checks through the host",async()=>{const root=resolve(import.meta.dirname,"../../../../..");const source=await readFile(resolve(root,"apps/platform-host/src/composition/register-services.ts"),"utf8");for(const binding of ["registerNeonFinance","registerFinanceHttpRoutes","registerFinanceJobHandlers","financeJobDefinitions","financeSliceOrder","finance.neon.${slice}"])expect(source).toContain(binding);for(const flag of ["financeF2Enabled","financeF3Enabled","financeF4Enabled","financeF5Enabled","financeF6Enabled"])expect(source).toContain(flag);});
});
