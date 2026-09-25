// @vitest-environment jsdom
import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {it,expect} from 'vitest';
import {MetadataFields} from '@athyper/platform-entity-form-detail';

it('uses published labels for enum values and nested collections; never substitutes the raw code',async()=>{
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  const options=[{value:'active',label:{labelKey:'test.active',defaultText:'Published active label'}}];
  const fields=[{key:'status',options},{key:'children',itemFields:[{key:'status',options}]}];
  try{
    await act(async()=>root.render(<MetadataFields fields={fields} values={{status:'active',children:[{status:'active'}]}}/>));
    expect(host.textContent?.match(/Published active label/g)).toHaveLength(2);
    await act(async()=>root.render(<MetadataFields fields={fields} values={{status:'unmapped_code'}}/>));
    expect(host.textContent).toContain('Enumeration label unavailable');
    expect(host.textContent).not.toContain('unmapped_code');
    await act(async()=>root.render(<MetadataFields fields={fields} values={{status:null}}/>));
    expect(host.textContent).not.toContain('Enumeration label unavailable');
  }finally{await act(async()=>root.unmount());host.remove();}
});
