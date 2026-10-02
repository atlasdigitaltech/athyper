import {readLockedPrincipalLocalePolicy} from '@athyper/server-adapter-experience-postgres';
import {normalizeLocalePolicy,catalogCodeForLocale} from '@athyper/server-platform-experience';
import {RecordServiceError, type RecordMutationPolicy, type RecordTransaction} from '@athyper/server-service-records';
/** UI preferences inherit the settings owner's locale governance, including admin edits. */
export function createUiProfileMutationPolicy():RecordMutationPolicy<RecordTransaction> {
 return {
  async validate({context,descriptor,values},transaction){
   if(descriptor.storage.schema!=='master'||descriptor.storage.object!=='principal_ui_profile')throw Error('UI_PROFILE_STORAGE_MISMATCH');
   const policy=normalizeLocalePolicy(context.planeKey,await readLockedPrincipalLocalePolicy(transaction,context));
   for(const field of ['locale_code','language_code']){
    const value=values[field];if(value===null||value===undefined)continue;
    const catalog=typeof value==='string'?catalogCodeForLocale(value):undefined;
    if(!catalog||!policy.enabledLocales.includes(catalog))throw new RecordServiceError(400,'EXPERIENCE_LOCALE_NOT_ENABLED','The selected locale or language is not enabled and qualified for this plane.');
   }
  },
  async committed(){ /* Records emits its standard transaction-bound audit/outbox event. */ },
 };
}
