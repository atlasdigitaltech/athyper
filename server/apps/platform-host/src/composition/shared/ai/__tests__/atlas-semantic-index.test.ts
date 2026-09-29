import { it, expect, vi } from 'vitest';
import { createAtlasSemanticIndex, parseAtlasSemanticConfig } from '../atlas-semantic-index.js';
const config={endpoint:'http://local:11434',model:'nomic-embed-text:v1.5',digest:'sha256:'+'a'.repeat(64),dimensions:768,indexUid:'atlas_attachment_passages_test',semanticRatio:0.75,scoreThreshold:0.72};
const scope={tenantId:'tenant',entityCode:'business_partner',recordId:'record'};
const citation={sourceId:'source',sourceVersionId:'version',revisionId:'revision',chunkId:'chunk',contentHash:'hash',characterStart:2000,characterEnd:2300};
function fixture({wrongModel=false,badVector=false,wrongTenant=false}={}){
 const calls:{url:string;body:any}[]=[];
 const fetcher=vi.fn(async(url:any,init:any)=>{const body=init.body?JSON.parse(init.body):undefined;calls.push({url,body});
 const value=url.endsWith('/api/tags')?{models:[{name:config.model,digest:wrongModel?'other':config.digest.slice(7)}]}:url.endsWith('/api/embed')?{model:config.model,embeddings:body.input.map(()=>Array(badVector?10:768).fill(0.1))}:url.includes('/tasks/')?{status:'succeeded'}:url.endsWith('/search')?{hits:[{...scope,tenantId:wrongTenant?'other':scope.tenantId,modelDigest:config.digest,citation,permissionCode:'read',_rankingScore:0.85}]}:{taskUid:1};
 return new Response(JSON.stringify(value),{status:200});});
 return {calls,index:createAtlasSemanticIndex({baseUrl:'http://search',apiKey:'test',fetch:fetcher as never},config)};
}
it('uses pinned local embeddings, exact tenant/record filters, and returns the ranked passage locator',async()=>{
 const f=fixture();const result=await f.index.search(scope,'How often should we reassess?',8);
 expect(result[0].citation.characterStart).toBe(2000);
 expect(f.calls.find(c=>c.url.endsWith('/api/embed'))?.body).toMatchObject({truncate:false,input:['search_query: How often should we reassess?']});
 expect(f.calls.find(c=>c.url.endsWith('/search'))?.body).toMatchObject({hybrid:{embedder:'atlas',semanticRatio:0.75},filter:['tenantId = "tenant"','entityCode = "business_partner"','recordId = "record"',`modelDigest = "${config.digest}"`]});
 expect(JSON.stringify(result)).not.toContain('embeddings');
});
it('does not trust a search provider that returns another tenant',async()=>{expect(await fixture({wrongTenant:true}).index.search(scope,'q',8)).toEqual([]);});
it('fails before embedding on a changed model digest',async()=>{const f=fixture({wrongModel:true});await expect(f.index.search(scope,'q',8)).rejects.toThrow('Pinned');expect(f.calls.some(c=>c.url.endsWith('/api/embed'))).toBe(false);});
it('rejects wrong vector dimensions',async()=>{await expect(fixture({badVector:true}).index.search(scope,'q',8)).rejects.toThrow('Invalid Atlas embedding');});
it('indexes later passages individually with canonical provenance and document prefixes',async()=>{const f=fixture();await f.index.index(scope,[{text:'Later paragraph',citation,permissionCode:'read'}]);const body=f.calls.find(c=>c.url.endsWith('/documents'))?.body;expect(body[0]).toMatchObject({...scope,id:'chunk',citation,_vectors:{atlas:expect.any(Array)}});expect(f.calls.find(c=>c.url.endsWith('/api/embed'))?.body.input).toEqual(['search_document: Later paragraph']);});
it('rejects mutable or unsupported embedding configuration',()=>{expect(()=>parseAtlasSemanticConfig({...config,digest:'latest'})).toThrow();expect(()=>parseAtlasSemanticConfig({...config,dimensions:1})).toThrow();});

it('embedding waits on the same inference admission used by generation and cancels without a provider call',async()=>{
 const {sharedAtlasInferenceQueue}=await import('@athyper/server-adapter-ai-ollama');
 const release=await sharedAtlasInferenceQueue.acquire(new AbortController().signal);
 const f=fixture(),abort=new AbortController();
 try{const request=f.index.search(scope,'synthetic',1,abort.signal);await new Promise(r=>setTimeout(r,10));
 expect(f.calls.some(c=>c.url.endsWith('/api/embed'))).toBe(false);abort.abort();await expect(request).rejects.toThrow();
 }finally{release();}
 await expect(f.index.search(scope,'synthetic',1)).resolves.toHaveLength(1);
});
