import {createHash} from "node:crypto";
import {mkdtemp,mkdir,writeFile,rm,chmod,symlink} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {it,expect} from "vitest";
import {createFileEntityReleaseReviewLoader} from "../file-entity-release-review-store.js";
const releaseId='11111111-1111-4111-8111-111111111111';
const coordinate={releaseId} as never;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
async function fixture(work:(directory:string,load:ReturnType<typeof createFileEntityReleaseReviewLoader>)=>Promise<void>){
 const root=await mkdtemp(join(tmpdir(),'release-review-'));
 try{
  const directory=join(root,releaseId);await mkdir(directory,{mode:0o700});
  const body='{"synthetic":true}\n';
  for(const file of ['packet.json','state.json','nomination.json'])await writeFile(join(directory,file),body,{mode:0o600});
  const manifest=JSON.stringify({schemaVersion:1,releaseId,packetSha256:hash(body),stateSha256:hash(body),nominationSha256:hash(body)});
  await writeFile(join(directory,'manifest.json'),manifest,{mode:0o600});
  await work(directory,createFileEntityReleaseReviewLoader(root,{[releaseId]:hash(manifest)}));
 }finally{await rm(root,{recursive:true,force:true});}
}
it('loads pinned immutable bytes and refuses unpinned release IDs',async()=>fixture(async(_dir,load)=>{
 expect(await load(coordinate)).toMatchObject({packet:{synthetic:true},state:{synthetic:true},nomination:{synthetic:true}});
 expect(await load({releaseId:'../../untrusted'} as never)).toBeNull();
}));
it.each(['changed','writable','symlink'])('rejects %s storage',async kind=>fixture(async(dir,load)=>{
 const path=join(dir,'state.json');
 if(kind==='changed')await writeFile(path,'{}');
 if(kind==='writable')await chmod(path,0o666);
 if(kind==='symlink'){await rm(path);await symlink(join(dir,'packet.json'),path);}
 await expect(load(coordinate)).rejects.toThrow();
}));
it('rejects relative storage roots and invalid deployment pins',()=>{
 expect(()=>createFileEntityReleaseReviewLoader('relative',{})).toThrow();
 expect(()=>createFileEntityReleaseReviewLoader('/tmp',{'../bad':'0'.repeat(64)})).toThrow();
});
