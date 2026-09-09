// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {BankDirectoryManage,type PublishedDirectory} from './bank-directory-manage';
it('filters published banks and keeps bank details separate from editable source drafts',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const directory:PublishedDirectory={id:'release',version:1,payload:{institutions:[{id:'sg',name:'DBS Bank',countryCode:'SG',institutionType:'bank',status:'active'},{id:'my',name:'Maybank',countryCode:'MY',institutionType:'bank',status:'active'}],branches:[],identifiers:[{id:'bic',institutionId:'sg',scheme:'bic',value:'DBSSSGSG'}]}};
 try{
 await act(async()=>root.render(<BankDirectoryManage directory={directory} loading={false} canAuthor={false} onImport={()=>{throw new Error('Reader cannot import')}}/>));
 expect(host.textContent).toContain('DBS Bank');expect(host.textContent).toContain('Maybank');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='DBS Bank')!.click());
 expect(host.querySelector('[aria-label="DBS Bank details"]')?.textContent).toContain('DBSSSGSG');
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Filters'))!.click());
 const select=[...host.querySelectorAll('select')].find(s=>s.textContent?.includes('All countries'))!;
 await act(async()=>{select.value='MY';select.dispatchEvent(new Event('change',{bubbles:true}));});
 const table=host.querySelector('table')!;expect(table.textContent).toContain('Maybank');expect(table.textContent).not.toContain('DBS Bank');
 expect(host.querySelector('textarea')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();}
});
