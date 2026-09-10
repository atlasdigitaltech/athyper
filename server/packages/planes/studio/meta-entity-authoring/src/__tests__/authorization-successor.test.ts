import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
import {compileAuthorizationSuccessorDescriptor} from '../authorization-successor.js';
import {compileGraph} from '../deterministic.js';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../../../../../../../governance/policy/reports/${name}.dev.json`,import.meta.url),'utf8'));
const source=read('business-partner-combined-source').source;
const proposal=read('business-partner-combined-successor');
const persisted=read('business-partner-combined-persisted-approval');
const input=()=>({nativeDescriptor:compileGraph(persisted.persistedGraph).descriptor, predecessor:{releaseId:source.publication_release_id,releaseNo:Number(source.release_no),publicationKey:source.release_key,descriptor:source.descriptor,authoredContract:source.authored_contract},proposedDescriptor:structuredClone(proposal.descriptor)});
it('materializes the approved combined content without changing Atlas or binding identities',()=>{
 const result=compileAuthorizationSuccessorDescriptor(input());
 expect(result).toEqual(proposal.descriptor);expect(result.ai).toEqual(source.descriptor.ai);
});
it('rejects changed predecessor, payload, native handler and missing carrier',()=>{
 const predecessor=input();predecessor.predecessor.releaseNo++;expect(()=>compileAuthorizationSuccessorDescriptor(predecessor)).toThrow();
 const payload=input();payload.proposedDescriptor.ai.enabled=false;expect(()=>compileAuthorizationSuccessorDescriptor(payload)).toThrow();
 const runtime=input() as any;runtime.nativeDescriptor.authorizationRuntime.bindings[0].handler='unreviewed';expect(()=>compileAuthorizationSuccessorDescriptor(runtime)).toThrow();
 const missing=input();missing.nativeDescriptor.surfaces=[];expect(()=>compileAuthorizationSuccessorDescriptor(missing)).toThrow();
});
