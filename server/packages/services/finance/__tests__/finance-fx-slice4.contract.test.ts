import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe,expect,it } from "vitest";

const root=resolve(import.meta.dirname,"../../../../..");
const read=(path:string)=>readFileSync(resolve(root,path),"utf8");

describe("Finance FX Slice 4 Rate Entity maintenance",()=>{
  it("registers required columns, filters, and governed operations in metadata",()=>{
    const metadata=read("server/db/seed/platform/003_control/106_finance_phase2_stage_a_contract.sql");
    expect(metadata).toContain('"list_columns":["from_currency","to_currency","rate","rate_type","effective_date","effective_time","source","status"]');
    for(const field of ["from_currency","to_currency","rate_type","effective_date","source","status"]){
      expect(metadata).toContain(`'${field}'`);
    }
    expect(metadata).toContain("'/app/fx_rate/new'");
    expect(metadata).toContain("'/app/fx_rate/{id}/replace'");
    expect(metadata).toContain("'/app/fx_rate/import'");
    expect(metadata).toContain("'/app/fx_rate/export'");
    expect(metadata).not.toContain("('fx_rate','delete'");
  });

  it("uses active descriptor-driven form and import packages",()=>{
    const form=read("packages/shared/runtime-domain/runtime-canvas/src/governed/governed-entity-form.tsx");
    const importer=read("packages/shared/runtime-domain/runtime-list/src/import/governed-entity-import.tsx");
    const addRoute=read("apps/neon/app/(shell)/app/[entity]/new/page.tsx");
    const replaceRoute=read("apps/neon/app/(shell)/app/[entity]/[id]/replace/page.tsx");
    const importRoute=read("apps/neon/app/(shell)/app/[entity]/import/page.tsx");
    expect(form).toContain("RuntimeEditInput");
    expect(form).toContain("onSubmit:(values");
    expect(importer).toContain('import("exceljs")');
    expect(importer).toContain("Validate all rows");
    expect(importer).toContain("replace_by_natural_key");
    expect(addRoute).toContain('entity==="fx_rate"');
    expect(replaceRoute).toContain('entity!=="fx_rate"');
    expect(importRoute).toContain("FxRateEntityImport");
    expect(importRoute).not.toContain("product-deprecated");
  });

  it("routes every rate write to the shared versioning service",()=>{
    const service=read("server/packages/services/finance/services/finance-fx-rate-import.service.ts");
    const adapter=read("apps/neon/app/(shell)/app/[entity]/FxRateGovernedForm.tsx");
    const runtimeCreate=read("apps/neon/app/api/runtime/v1/entities/[entity]/route.ts");
    const runtimeMutation=read("apps/neon/app/api/runtime/v1/entities/[entity]/[id]/route.ts");
    expect(service).toMatch(/importFxRates[\s\S]*replaceValidatedFxRate/);
    expect(service).toMatch(/replaceFxRate[\s\S]*replaceValidatedFxRate/);
    expect(service).toContain('mode==="create"?"create":"upsert"');
    expect(adapter).toContain("/fx/rates");
    expect(adapter).toContain("/replace");
    expect(runtimeCreate).toContain('descriptor.entityCode === "fx_rate"');
    expect(runtimeCreate).toContain("/api/finance/setup/tenant/");
    expect(runtimeMutation).toContain("FX_RATE_REPLACEMENT_REQUIRED");
    expect(runtimeMutation).toContain("FX_RATE_DELETE_NOT_SUPPORTED");
  });

  it("keeps old versions inspectable and exports full lineage",()=>{
    const service=read("server/packages/services/finance/services/finance-fx-rate-import.service.ts");
    const detail=read("apps/neon/app/(shell)/app/[entity]/FxRateLineagePanel.tsx");
    const exportPage=read("apps/neon/app/(shell)/app/[entity]/FxRateEntityExport.tsx");
    expect(service).toContain('successor.id AS "successorId"');
    expect(service).toContain('COALESCE(supersedes_id::text');
    expect(service).toContain("WHERE tenant_id=${tenantId}::uuid");
    expect(detail).toContain("Previous version");
    expect(detail).toContain("Successor v");
    expect(exportPage).toContain("active and superseded");
  });
});
