import type { Request, RequestHandler, Router } from "express";
import { resolvePrincipalIdWithJit, resolveTenantId, verifyBearer } from "@athyper/svc-shared";
import type { FinanceRouteDeps } from "./finance.route.js";
import { FinanceFxError, loadCurrencyFxSetup, saveFxPolicy, traceFxResolution, type FxRateType } from "../services/finance-fx-policy.service.js";
import { importFxRates, listFxRates, validateFxRateImport } from "../services/finance-fx-rate-import.service.js";

interface FxContext { tenantId:string; principalId:string|null; req:Request; }
type FxRunner=(ctx:FxContext)=>Promise<unknown>;

function handler(deps:FinanceRouteDeps,mutation:boolean,runner:FxRunner):RequestHandler {
  return async(req,res,next)=>{ try {
    const claims=await verifyBearer(req.headers.authorization??"",deps.auth,res); if(!claims)return;
    const realm=String(req.headers["x-realm"]??"athyper"),tenantId=await resolveTenantId(deps.db,String(req.headers["x-org"]??""),realm);
    if(!tenantId){res.status(400).json({error:"MISSING_TENANT",message:"Tenant could not be resolved."});return;}
    const tenantCode=String(req.params.tenantCode??"").trim();
    if(tenantCode){const tenant=await deps.db.selectFrom("master.tenant").select("id").where("id","=",tenantId).where("code","=",tenantCode).executeTakeFirst();if(!tenant){res.status(404).json({error:"TENANT_NOT_FOUND",message:"Tenant is not available in the active session."});return;}}
    const companyCode=String(req.params.companyCode??"").trim(),activeLegalEntityId=String(req.headers["x-legal-entity-id"]??"").trim();
    if(companyCode){const company=await deps.db.selectFrom("master.company_code").select("id").where("tenant_id","=",tenantId).where("code","=",companyCode).$if(Boolean(activeLegalEntityId),qb=>qb.where("legal_entity_id","=",activeLegalEntityId)).executeTakeFirst();if(!company){res.status(404).json({error:"COMPANY_NOT_FOUND",message:"Company is not available in the active tenant and Legal Entity."});return;}}
    let principalId:string|null=null;
    if(mutation){const sub=typeof claims.sub==="string"?claims.sub:""; principalId=sub?await resolvePrincipalIdWithJit(deps.db,sub,tenantId,realm,claims):null; if(!principalId){res.status(403).json({error:"PRINCIPAL_NOT_RESOLVED",message:"Actor principal could not be resolved."});return;}}
    res.json(await runner({tenantId,principalId,req}));
  }catch(error){const e=error as Error&{status?:number;code?:string;details?:unknown}; if(e instanceof FinanceFxError||typeof e.status==="number"){res.status(e.status??400).json({error:e.code??"FX_SETUP_FAILED",message:e.message,details:e.details});return;} deps.logger?.error("finance_fx_setup_error",{err:String(error)});next(error);}};
}

function q(req:Request,key:string){const value=req.query[key];return typeof value==="string"?value:undefined;}

export function createFinanceFxSetupRoutes(router:Router,deps:FinanceRouteDeps):void {
  router.get("/finance/setup/company/:companyCode/fx",handler(deps,false,async({tenantId,req})=>
    loadCurrencyFxSetup(deps.db,tenantId,String(req.params.companyCode),q(req,"asOfDate"))));
  router.get("/finance/setup/company/:companyCode/fx/resolution-trace",handler(deps,false,async({tenantId,req})=>{
    const from=q(req,"fromCurrency"),to=q(req,"toCurrency"); if(!from||!to) throw new FinanceFxError("MISSING_PAIR",400,"fromCurrency and toCurrency are required.");
    return traceFxResolution(deps.db,{tenantId,companyCode:String(req.params.companyCode),fromCurrency:from,toCurrency:to,rateType:q(req,"rateType") as FxRateType|undefined,asOfDate:q(req,"asOfDate"),transactionContext:q(req,"transactionContext"),ledgerBookId:q(req,"ledgerBookId")});
  }));
  router.post("/finance/setup/company/:companyCode/fx/policies",handler(deps,true,async({tenantId,principalId,req})=>
    saveFxPolicy(deps.db,{tenantId,companyCode:String(req.params.companyCode),actorId:principalId!,body:(req.body??{}) as Record<string,unknown>})));
  router.get("/finance/setup/tenant/:tenantCode/fx/rates",handler(deps,false,async({tenantId,req})=>
    listFxRates(deps.db,tenantId,{fromCurrency:q(req,"fromCurrency"),toCurrency:q(req,"toCurrency"),rateType:q(req,"rateType"),limit:Number(q(req,"limit")??100)})));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/validate-import",handler(deps,false,async({tenantId,req})=>
    validateFxRateImport(deps.db,tenantId,Array.isArray(req.body)?req.body:req.body?.rows)));
  router.post("/finance/setup/tenant/:tenantCode/fx/rates/import",handler(deps,true,async({tenantId,principalId,req})=>
    importFxRates(deps.db,tenantId,principalId!,Array.isArray(req.body)?req.body:req.body?.rows)));
}
