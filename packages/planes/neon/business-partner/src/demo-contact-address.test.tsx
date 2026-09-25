// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {Collection} from '../../../../platform/entity/runtime/form-detail/src/section-primitives';
import {CompiledEntitySectionContent} from '../../../../platform/entity/runtime/form-detail/src/compiled-section-content';
vi.mock('@athyper/platform-ui',()=>({Card:({children}:any)=><div>{children}</div>,PanelEmptyState:({title}:any)=><p>{title}</p>}));
it('renders multiple authorized contact channels without object placeholders or invented values',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const node=document.createElement('div'),root=createRoot(node);
 try{await act(async()=>root.render(<Collection fields={[]} items={[{displayName:'Alex Example',channels:[{id:'1',type:'email',value:'demo@example.test',verified:false},{id:'2',type:'phone',verified:false},{id:'3',type:'website',value:'https://example.test'}]}]}/>));
 expect(node.textContent).toContain('Email: demo@example.test');expect(node.textContent).toContain('Phone: Restricted');expect(node.textContent).toContain('Website: https://example.test');expect(node.textContent).not.toContain('Available');
 }finally{await act(async()=>root.unmount());}
});
it('renders postal display DTOs rather than unrelated link database fields',async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});const node=document.createElement('div'),root=createRoot(node);
 const resource:any={presentation:{rendererKey:'platform.postal-address.v1',fields:[{key:'owner_type_id'}],childCollections:[]},data:{items:[{id:'1',purpose:'default',lines:['10 Example Research Way'],locality:'London',countryCode:'GB',primary:true}]}};
 try{await act(async()=>root.render(<CompiledEntitySectionContent resource={resource}/>));expect(node.textContent).toContain('10 Example Research Way');expect(node.textContent).toContain('London');expect(node.textContent).not.toContain('Owner Type Id');
 }finally{await act(async()=>root.unmount());}
});
