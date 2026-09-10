import {expect,it,vi} from "vitest";
import {createBusinessPartnerExportRegistration} from "../business-partner-export-runtime.js";
it("binds actual transfer methods to BP and propagates preflight failure without executing",async()=>{
 const transfers={preflightExport:vi.fn(async()=>{}),requestExport:vi.fn(async()=>({jobId:"job"}))};
 const entry=createBusinessPartnerExportRegistration(transfers as never,{resolve:async()=>({state:"invalid"}),preflight:async()=>"not_applicable"});
 const context={planeKey:"neon"};
 expect(await Reflect.apply(entry.preflight!.check,null,[{context,operationKey:"export",coordinates:{operatingOrganizationId:"org"}}])).toBe("allowed");
 expect(transfers.preflightExport).toHaveBeenCalledWith(context,"business_partner",{scopeCoordinate:{operatingOrganizationId:"org"}});
 expect(transfers.requestExport).not.toHaveBeenCalled();
 transfers.preflightExport.mockRejectedValueOnce(Error("UNAVAILABLE"));
 await expect(Reflect.apply(entry.preflight!.check,null,[{context,operationKey:"export"}])).rejects.toThrow("UNAVAILABLE");
 expect(()=>Reflect.apply(entry.handler.invoke,null,[{planeKey:"mesh"},{}])).toThrow("MISMATCH");
 await Reflect.apply(entry.handler.invoke,null,[context,{fields:["code"]},"request"]);
 expect(transfers.requestExport).toHaveBeenCalledWith(context,"business_partner",{fields:["code"]},"request");
});
