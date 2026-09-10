import { expect, it } from 'vitest';
import { createAtlasLocalGenerationServices, parseAtlasLocalConfiguration } from '../local-generation-composition.js';
import { context } from './review-fixture.js';
const config={schema:'atlas-local-inference/1',endpoint:'http://atlas-inference:11434',engine:{version:'0.33.3',image:'ollama/ollama@sha256:'+'b'.repeat(64)},model:{upstream:'qwen3:8b',digest:'sha256:'+'a'.repeat(64),publicId:'atlas-re-1.0-local',displayName:'Atlas RE 1.0 Local'},request:{num_ctx:4096,num_predict:1024,think:false},cloudEnabled:false};
it('rejects mutable artifacts, cloud transport and altered context settings',()=>{
 for(const c of [{...config,cloudEnabled:true},{...config,endpoint:'https://external.test'}, {...config,model:{...config.model,digest:null}},{...config,request:{...config.request,num_ctx:8192}}])expect(()=>parseAtlasLocalConfiguration(c)).toThrow();
});
it('composes basic local generation without optional admin or knowledge dependencies',async()=>{
 const services=createAtlasLocalGenerationServices({transactions:{} as never,config:parseAtlasLocalConfiguration(config),provider:{providerId:'ollama',adapterId:'ollama-native',adapterVersion:'1',async*invoke(){}}});
 for(const plane of ['neon','mesh','studio']as const){
  const c={...context,planeKey:plane,permissions:{...context.permissions,planeKey:plane,allowed:[`${plane}.ai.agent.use`]}};
  expect(await services.admission.resolve(c)).toMatchObject({chatAllowed:true,readToolsAllowed:false,mutationToolsAllowed:false,allowedPublicModelIds:['atlas-re-1.0-local']});
  expect(await services.admission.resolve({...c,permissions:{...c.permissions,denied:[`${plane}.ai.agent.use`]}})).toMatchObject({chatAllowed:false,allowedPublicModelIds:[]});
 }
 expect(services.binding.routingPolicyId).toBe('no-fallback-v1');expect(services.binding.credentialPolicy).toBe('local_transport');
});
it('admits generic reads across planes while mutations remain Neon only',async()=>{
 for(const mutationsEnabled of [false,true]){
  const services=createAtlasLocalGenerationServices({transactions:{} as never,config:parseAtlasLocalConfiguration(config),provider:{providerId:'ollama',adapterId:'ollama-native',adapterVersion:'1',async*invoke(){}},tools:{readEnabled:true,mutationsEnabled,available:()=>true,coordinator:{async definitions(){return[];},async handle(){throw Error('not used');}}}});
  for(const plane of ['neon','mesh','studio']as const){const c={...context,planeKey:plane,permissions:{...context.permissions,planeKey:plane,allowed:[`${plane}.ai.agent.use`]}};expect(await services.admission.resolve(c)).toMatchObject({readToolsAllowed:true,mutationToolsAllowed:plane==='neon'&&mutationsEnabled});}
 }
});

it('does not admit reads when the Records owner is unavailable', async () => {
 const services=createAtlasLocalGenerationServices({transactions:{} as never,config:parseAtlasLocalConfiguration(config),provider:{providerId:'ollama',adapterId:'ollama-native',adapterVersion:'1',async*invoke(){}},tools:{readEnabled:true,mutationsEnabled:true,available:()=>false,coordinator:{async definitions(){return[];},async handle(){throw Error('not used');}}}});
 expect(await services.admission.resolve({...context,permissions:{...context.permissions,allowed:['neon.ai.agent.use']}})).toMatchObject({readToolsAllowed:false,mutationToolsAllowed:false});
});

it('honors the live admission policy for chat, generation and conversation access',async()=>{
 let allowed=false,providerCalls=0;
 const services=createAtlasLocalGenerationServices({authorizeAdmission:async()=>allowed,transactions:{} as never,config:parseAtlasLocalConfiguration(config),provider:{providerId:'ollama',adapterId:'ollama-native',adapterVersion:'1',async*invoke(){providerCalls++;}}});
 const c={...context,permissions:{...context.permissions,allowed:['neon.ai.agent.use']}};
 expect(await services.admission.resolve(c)).toMatchObject({chatAllowed:false,persistenceAllowed:false});
 expect(await services.authorizer.authorize({context:c,operation:'create'})).toBe(false);
 const execute=async()=>{for await(const _event of services.runtime.run({context:c,threadId:'thread',clientRequestId:'denied',publicModelId:'atlas-re-1.0-local',dataClass:'internal',catalogPolicyRevision:(await services.admission.resolve(c)).policyRevision,userText:'Synthetic admission probe'})){} };
 await expect(execute()).rejects.toThrow();expect(providerCalls).toBe(0);
 allowed=true;expect(await services.admission.resolve(c)).toMatchObject({chatAllowed:true,persistenceAllowed:true});
 expect(await services.authorizer.authorize({context:c,operation:'create'})).toBe(true);
 allowed=false;expect(await services.authorizer.authorize({context:c,operation:'read'})).toBe(false);
});
