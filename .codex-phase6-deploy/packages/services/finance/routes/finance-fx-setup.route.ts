import type { Request, RequestHandler, Router } from "express";
import { sql } from "kysely";
import { resolvePrincipalIdWithJit, resolveTenantId, verifyBearer } from "@athyper/svc-shared";
import { checkPermission } from "@athyper/svc-iam";
import type { FinanceRouteDeps } from "./finance.route.js";
import {
  endFxPolicyCommand, FinanceFxError, saveFxPolicyCommand, traceFxResolution, type FxRateType,
} from "../services/finance-fx-policy.service.js";
import {
  addFxRate, exportFxRates, getFxRate, importFxRates, listFxRates, replaceFxRate,
  validateFxRateImport, type FxRateImportMode,
} from "../services/finance-fx-rate-import.service.js";
import { loadTenantFxSummary } from "../services/finance-fx-tenant-summary.service.js";
import { loadCompanyFxSummary } from "../services/finance-fx-company-summary.service.js";
import {
  allowedCapability, deniedCapability, type FxCapability, type FxPermissions,
} from "../services/finance-fx-contracts.js";

interface FxContext {
  tenantId:string;
  tenantCode:string;
  principalId:string;
  legalEntityId:string|null;
  companyId:string|null;
  companyCode:string|null;
  allowedCompanyIds:string[];
  req:Request;
}
type FxRunner=(ctx:FxContext)=>Promise<unknown>;
type FxScope="tenant_read"|"tenant_command"|"company";

const PERMISSIONS={
  view:"FINANCE_SETUP.VIEW",
  configure:"FINANCE_SETUP.CONFIGURE",
  advanced:"FINANCE_SETUP.ADVANCED_CONFIGURE",
  addRate:"create",
  replaceRate:"replace",
  importRates:"import",
  exportRates:"export",
} as const;

function q(req:Request,key:string){const value=req.query[key];return typeof value==="string"?value:undefined;}
const today=()=>new Date().toISOString().slice(0,10);
const FX_ENTITY_NAVIGATION_FLAG="finance.fx_entity_navigation";

async function resolveFxNavigation(deps:FinanceRouteDeps,ctx:Pick<FxContext,"tenantId"|"tenantCode">) {
  const entityNavigationEnabled=await deps.featureFlags?.isEnabled(FX_ENTITY_NAVIGATION_FLAG,ctx.tenantId)??false;
  const tenantSettingsHref=`/finance/setup/tenant/${encodeURIComponent(ctx.tenantCode)}/currency-fx`;
  const navigation={
    mode:entityNavigationEnabled?"entity" as const:"legacy" as const,
    flagCode:FX_ENTITY_NAVIGATION_FLAG,
    tenantSettingsHref,
    rateListHref:entityNavigationEnabled?"/app/fx_rate":tenantSettingsHref,
    rateAddHref:entityNavigationEnabled?"/app/fx_rate/new":tenantSettingsHref,
    rateImportHref:entityNavigationEnabled?"/app/fx_rate/import":tenantSettingsHref,
    rollbackRequiresDataChange:false as const,
  };
  deps.logger?.info?.("finance_fx_navigation_resolved",{
    tenantId:ctx.tenantId,mode:navigation.mode,flagCode:FX_ENTITY_NAVIGATION_FLAG,
  });
  return navigation;
}

function scopedAllowed(companyIds:string[],scope:FxScope,companyId:string|null):boolean {
  if(companyIds.length===0)return true;
  if(scope==="tenant_command")return false;
  if(scope==="company")return Boolean(companyId&&companyIds.includes(companyId));
  return true;
}

async function permissionCapability(
  deps:FinanceRouteDeps,ctx:Pick<FxContext,"tenantId"|"principalId"|"companyId">,
  permission:string,scope:FxScope,
):Promise<FxCapability> {
  const decision=await checkPermission(deps.db,ctx.tenantId,ctx.principalId,permission,{
    entity_type:"fx_setup",company_code_id:ctx.companyId??undefined,
  });
  if(decision.decision!=="allow")return deniedCapability(permission,`FX_PERMISSION_${decision.decision.toUpperCase()}`);
  if(!scopedAllowed(decision.scope.company_code_ids,scope,ctx.companyId))
    return deniedCapability(permission,scope==="tenant_command"?"FX_TENANT_SCOPE_DENIED":"FX_COMPANY_SCOPE_DENIED");
  return allowedCapability(permission);
}

async function buildPermissions(deps:FinanceRouteDeps,ctx:FxContext,scope:FxScope):Promise<FxPermissions> {
  const viewScope=scope==="tenant_command"?"tenant_read":scope;
  const configurationScope=scope==="company"?"company":"tenant_command";
  const [view,configure,advancedConfigure,addRate,replaceRate,importRates,exportRates]=await Promise.all([
    permissionCapability(deps,ctx,PERMISSIONS.view,viewScope),
    permissionCapability(deps,ctx,PERMISSIONS.configure,configurationScope),
    permissionCapability(deps,ctx,PERMISSIONS.advanced,configurationScope),
    permissionCapability(deps,ctx,PERMISSIONS.addRate,"tenant_command"),
    permissionCapability(deps,ctx,PERMISSIONS.replaceRate,"tenant_command"),
    permissionCapability(deps,ctx,PERMISSIONS.importRates,"tenant_command"),
    permissionCapability(deps,ctx,PERMISSIONS.exportRates,"tenant_command"),
  ]);
  return {view,configure,advancedConfigure,addRate,replaceRate,importRates,exportRates};
}

function handler(
  deps:FinanceRouteDeps,
  permission:string,
  scope:FxScope,
  runner:FxRunner,
):RequestHandler {
  return async(req,res,next)=>{try{
    const claims=await verifyBearer(req.headers.authorization??"",deps.auth,res);if(!claims)return;
    const realm=String(req.headers["x-realm"]??"athyper");
    const tenantId=await resolveTenantId(deps.db,String(req.headers["x-org"]??""),realm);
    if(!tenantId)throw new FinanceFxError("FX_TENANT_CONTEXT_REQUIRED",400,"Tenant could not be resolved.");
    const {rows:tenants}=await sql<{code:string}>`
      SELECT code FROM master.tenant WHERE id=${tenantId}::uuid
        AND (${String(req.params.tenantCode??"")}='' OR code=${String(req.params.tenantCode??"")})
    `.execute(deps.db);
    const tenant=tenants[0];
    if(!tenant)throw new FinanceFxError("FX_TENANT_SCOPE_DENIED",404,"Requested Tenant is outside the active session.");

    const sub=typeof claims.sub==="string"?claims.sub:"";
    const principalId=sub?await resolvePrincipalIdWithJit(deps.db,sub,tenantId,realm,claims):null;
    if(!principalId)throw new FinanceFxError("FX_PRINCIPAL_NOT_RESOLVED",403,"Actor principal could not be resolved.");

    const legalEntityId=String(req.headers["x-legal-entity-id"]??"").trim()||null;
    if(legalEntityId){
      const legalEntity=await deps.db.selectFrom("master.legal_entity").select("id")
        .where("tenant_id","=",tenantId).where("id","=",legalEntityId).executeTakeFirst();
      if(!legalEntity)throw new FinanceFxError("FX_LEGAL_ENTITY_SCOPE_DENIED",403,"Legal Entity is outside the active Tenant.");
    }
    const companyCode=String(req.params.companyCode??"").trim()||null;
    let companyId:string|null=null;
    if(companyCode){
      const company=await deps.db.selectFrom("master.company_code").select("id")
        .where("tenant_id","=",tenantId).where("code","=",companyCode)
        .$if(Boolean(legalEntityId),query=>query.where("legal_entity_id","=",legalEntityId!))
        .executeTakeFirst();
      if(!company)throw new FinanceFxError("FX_COMPANY_SCOPE_DENIED",404,"Company is outside the active Tenant and Legal Entity.");
      companyId=String(company.id);
    }

    const decision=await checkPermission(deps.db,tenantId,principalId,permission,{
      entity_type:"fx_setup",company_code_id:companyId??undefined,
      request_id:String(req.headers["x-request-id"]??"")||undefined,
    });
    if(decision.decision!=="allow")
      throw new FinanceFxError("FX_PERMISSION_DENIED",403,`Missing permission ${permission}.`,{permission,decision:decision.decision,reason:decision.reason});
    if(!scopedAllowed(decision.scope.company_code_ids,scope,companyId))
      throw new FinanceFxError(scope==="tenant_command"?"FX_TENANT_SCOPE_DENIED":"FX_COMPANY_SCOPE_DENIED",403,"Permission assignment scope does not cover this FX resource.");

    const ctx={tenantId,tenantCode:tenant.code,principalId,legalEntityId,companyId,companyCode,allowedCompanyIds:decision.scope.company_code_ids,req};
    res.json(await runner(ctx));
  }catch(error){
    const e=error as Error&{status?:number;code?:string;details?:unknown};
    if(e instanceof FinanceFxError||typeof e.status==="number"){
      res.status(e.status??400).json({error:e.code??"FX_SETUP_FAILED",message:e.message,details:e.details});return;
    }
    deps.logger?.error("finance_fx_setup_error",{err:String(error)});next(error);
  }};
}

export function createFinanceFxSetupRoutes(router:Router,deps:FinanceRouteDeps):void {
  router.get("/finance/setup/tenant/:tenantCode/fx",handler(deps,PERMISSIONS.view,"tenant_read",async ctx=>{
    const summary=await loadTenantFxSummary(deps.db,{
      tenantId:ctx.tenantId,tenantCode:ctx.tenantCode,asOfDate:q(ctx.req,"asOfDate")??today(),
      permissions:await buildPermissions(deps,ctx,"tenant_command"),allowedCompanyIds:ctx.allowedCompanyIds,
    });
    return {...summary,navigation:await resolveFxNavigation(deps,ctx)};
  }));

  router.get("/finance/setup/company/:companyCode/fx",handler(deps,PERMISSIONS.view,"company",async ctx=>{
    const summary=await loadCompanyFxSummary(deps.db,{
      tenantId:ctx.tenantId,companyCode:ctx.companyCode!,asOfDate:q(ctx.req,"asOfDate")??today(),
      legalEntityId:ctx.legalEntityId,permissions:await buildPermissions(deps,ctx,"company"),
    });
    return {...summary,navigation:await resolveFxNavigation(deps,ctx)};
  }));

  router.get("/finance/setup/company/:companyCode/fx/resolution-trace",handler(deps,PERMISSIONS.advanced,"company",async ctx=>{
    const from=q(ctx.req,"fromCurrency"),to=q(ctx.req,"toCurrency");
    if(!from||!to)throw new FinanceFxError("FX_PAIR_REQUIRED",400,"fromCurrency and toCurrency are required.");
    return traceFxResolution(deps.db,{
      tenantId:ctx.tenantId,companyCode:ctx.companyCode!,fromCurrency:from,toCurrency:to,
      rateType:q(ctx.req,"rateType") as FxRateType|undefined,asOfDate:q(ctx.req,"asOfDate"),
      transactionContext:q(ctx.req,"transactionContext"),ledgerBookId:q(ctx.req,"ledgerBookId"),
      purpose:q(ctx.req,"purpose")==="revaluation"?"revaluation":"transaction",
    });
  }));

  router.post("/finance/setup/tenant/:tenantCode/fx/policies",handler(deps,PERMISSIONS.configure,"tenant_command",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"tenant",body:(ctx.req.body??{}) as Record<string,unknown>})));
  router.post("/finance/setup/tenant/:tenantCode/fx/policies/:policyId/replace",handler(deps,PERMISSIONS.configure,"tenant_command",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"tenant",policyId:String(ctx.req.params.policyId),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo),body:(ctx.req.body??{}) as Record<string,unknown>})));

  router.post("/finance/setup/company/:companyCode/fx/overrides",handler(deps,PERMISSIONS.configure,"company",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"company",companyCode:ctx.companyCode!,body:(ctx.req.body??{}) as Record<string,unknown>})));
  router.post("/finance/setup/company/:companyCode/fx/overrides/:policyId/replace",handler(deps,PERMISSIONS.configure,"company",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"company",companyCode:ctx.companyCode!,policyId:String(ctx.req.params.policyId),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo),body:(ctx.req.body??{}) as Record<string,unknown>})));
  router.post("/finance/setup/company/:companyCode/fx/overrides/:policyId/end",handler(deps,PERMISSIONS.configure,"company",ctx=>
    endFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"company",companyCode:ctx.companyCode!,policyId:String(ctx.req.params.policyId),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo),endDate:ctx.req.body?.endDate?String(ctx.req.body.endDate):undefined})));

  router.post("/finance/setup/company/:companyCode/fx/book-overrides",handler(deps,PERMISSIONS.advanced,"company",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"book",companyCode:ctx.companyCode!,ledgerBookId:String(ctx.req.body?.ledgerBookId??""),body:(ctx.req.body??{}) as Record<string,unknown>})));
  router.post("/finance/setup/company/:companyCode/fx/book-overrides/:policyId/replace",handler(deps,PERMISSIONS.advanced,"company",ctx=>
    saveFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"book",companyCode:ctx.companyCode!,ledgerBookId:String(ctx.req.body?.ledgerBookId??""),policyId:String(ctx.req.params.policyId),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo),body:(ctx.req.body??{}) as Record<string,unknown>})));
  router.post("/finance/setup/company/:companyCode/fx/book-overrides/:policyId/end",handler(deps,PERMISSIONS.advanced,"company",ctx=>
    endFxPolicyCommand(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,scopeType:"book",companyCode:ctx.companyCode!,ledgerBookId:String(ctx.req.body?.ledgerBookId??""),policyId:String(ctx.req.params.policyId),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo),endDate:ctx.req.body?.endDate?String(ctx.req.body.endDate):undefined})));

  router.get("/finance/setup/tenant/:tenantCode/fx/rates",handler(deps,PERMISSIONS.view,"tenant_read",ctx=>
    listFxRates(deps.db,ctx.tenantId,{fromCurrency:q(ctx.req,"fromCurrency"),toCurrency:q(ctx.req,"toCurrency"),rateType:q(ctx.req,"rateType"),limit:Number(q(ctx.req,"limit")??100)})));
  router.get("/finance/setup/tenant/:tenantCode/fx/rates/export",handler(deps,PERMISSIONS.exportRates,"tenant_command",ctx=>
    exportFxRates(deps.db,ctx.tenantId)));
  router.get("/finance/setup/tenant/:tenantCode/fx/rates/:rateId",handler(deps,PERMISSIONS.view,"tenant_read",ctx=>
    getFxRate(deps.db,ctx.tenantId,String(ctx.req.params.rateId))));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates",handler(deps,PERMISSIONS.addRate,"tenant_command",ctx=>
    addFxRate(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,row:(ctx.req.body??{})})));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/:rateId/replace",handler(deps,PERMISSIONS.replaceRate,"tenant_command",ctx=>
    replaceFxRate(deps.db,{tenantId:ctx.tenantId,actorId:ctx.principalId,rateId:String(ctx.req.params.rateId),row:(ctx.req.body??{}),expectedVersionNo:Number(ctx.req.body?.expectedVersionNo)})));

  const importMode=(ctx:FxContext):FxRateImportMode=>ctx.req.body?.mode==="create"?"create":"replace_by_natural_key";
  const validateImport:FxRunner=ctx=>validateFxRateImport(
    deps.db,ctx.tenantId,Array.isArray(ctx.req.body)?ctx.req.body:ctx.req.body?.rows,{mode:importMode(ctx)},
  );
  const postImport:FxRunner=ctx=>importFxRates(
    deps.db,ctx.tenantId,ctx.principalId,Array.isArray(ctx.req.body)?ctx.req.body:ctx.req.body?.rows,importMode(ctx),
  );
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/imports/validate",handler(deps,PERMISSIONS.importRates,"tenant_command",validateImport));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/imports",handler(deps,PERMISSIONS.importRates,"tenant_command",postImport));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/validate-import",handler(deps,PERMISSIONS.importRates,"tenant_command",validateImport));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/import",handler(deps,PERMISSIONS.importRates,"tenant_command",postImport));
}
