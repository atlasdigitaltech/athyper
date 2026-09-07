import {expect,it} from 'vitest';
import {fitLocalPrompt,localPromptTokenBound} from '../local-context.js';
import type {AtlasModelPrompt} from '../model.js';
it('budgets Unicode bytes, system instructions, tools, and reserved output',()=>{
 const p:AtlasModelPrompt={messages:[{role:'system',content:[{type:'text',text:'system'}]},{role:'user',content:[{type:'text',text:'你'.repeat(1000)}]}],maxOutputTokens:1024};
 expect(()=>fitLocalPrompt(p)).toThrow();
 expect(()=>fitLocalPrompt({...p,messages:[{role:'user',content:[{type:'text',text:'ok'}]}],tools:[{name:'big',description:'x'.repeat(4000),inputSchema:{}}]})).toThrow();
});
it('evicts complete old turns while preserving current input and system text',()=>{
 const p:AtlasModelPrompt={maxOutputTokens:1024,messages:[{role:'system',content:[{type:'text',text:'system'}]},{role:'user',content:[{type:'text',text:'a'.repeat(1200)}]},{role:'assistant',content:[{type:'text',text:'b'.repeat(1200)}]},{role:'user',content:[{type:'text',text:'latest'}]}]};
 const result=fitLocalPrompt(p);expect(result.messages.map(m=>m.content)).toEqual([p.messages[0]!.content,p.messages[3]!.content]);expect(localPromptTokenBound(result)+1024).toBeLessThanOrEqual(4096);
});
