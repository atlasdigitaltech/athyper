import {it,expect,vi} from 'vitest';
const read=vi.hoisted(()=>vi.fn());
vi.mock('@athyper/server-adapter-experience-postgres',()=>({readLockedPrincipalLocalePolicy:read}));
import {createUiProfileMutationPolicy} from './ui-profile-mutation-policy.js';
const input={context:{planeKey:'neon',tenantId:'tenant',principalId:'admin'},descriptor:{storage:{schema:'master',object:'principal_ui_profile'}},action:'patch'} as const;
it('rejects a valid reference locale when the owning settings policy has not enabled it',async()=>{
 read.mockResolvedValue({enabledLocales:['en'],defaultLocale:'en',fallbackLocale:'en',revision:'r1'});
 await expect(createUiProfileMutationPolicy().validate({...input,values:{principal_id:'other-user',locale_code:'ms-MY'}} as never,{} as never)).rejects.toMatchObject({code:'EXPERIENCE_LOCALE_NOT_ENABLED'});
});
it('allows inherited defaults and qualified English without changing the target owner',async()=>{
 read.mockResolvedValue({enabledLocales:['en'],defaultLocale:'en',fallbackLocale:'en',revision:'r1'});
 for(const values of [{principal_id:'self',locale_code:null,language_code:null},{principal_id:'other-user',locale_code:'en-GB',language_code:'en'}]){
  await expect(createUiProfileMutationPolicy().validate({...input,values} as never,{} as never)).resolves.toBeUndefined();
  expect(values.principal_id).toBeDefined();
 }
});
it('rejects an independently disabled UI language and use on another storage object',async()=>{
 read.mockResolvedValue({enabledLocales:['en'],defaultLocale:'en',fallbackLocale:'en',revision:'r1'});
 await expect(createUiProfileMutationPolicy().validate({...input,values:{locale_code:'en-GB',language_code:'ms'}} as never,{} as never)).rejects.toMatchObject({code:'EXPERIENCE_LOCALE_NOT_ENABLED'});
 await expect(createUiProfileMutationPolicy().validate({...input,descriptor:{storage:{schema:'master',object:'principal'}},values:{}} as never,{} as never)).rejects.toThrow('UI_PROFILE_STORAGE_MISMATCH');
});
