import { expect, it, vi } from "vitest";
import { prepareRuntimeRestorationRelease } from "../runtime-restoration-publication";
const mock=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock("kysely",()=>({sql:()=>({execute:mock.execute})}));
vi.mock("../runtime-restoration",()=>({compileRuntimeRestoration:()=>({tenantId:"tenant",descriptor:{entityCode:"bp"},publicationKey:"metadata.entity.bp"})}));
it("translates only the duplicate restoration failure and preserves other failures",async()=>{
 const input={releaseId:"release",artifact:{} as never,targetPlanes:["neon"]};
 for(const message of ["RESTORATION_PUBLICATION_ALREADY_EXISTS","database unavailable"]){
  mock.execute.mockReset().mockResolvedValueOnce({rows:[{tenant_id:"tenant",published_by:"author"}]}).mockRejectedValueOnce(new Error(message));
  const result=prepareRuntimeRestorationRelease({} as never,input,async()=>true);
  if(message.startsWith("RESTORATION"))await expect(result).rejects.toMatchObject({code:message,message:expect.stringContaining("successor")});
  else await expect(result).rejects.toThrow(message);
 }
});
