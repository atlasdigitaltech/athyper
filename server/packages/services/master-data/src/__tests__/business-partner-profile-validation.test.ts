import {describe,it,expect} from 'vitest';
import {validateBusinessPartnerProfile} from '../business-partner-profile-validation.js';
const alias={clientItemKey:'alias-1',definitionFieldCode:'aliases',aliasName:'Example Trading',aliasKind:'trading'};
describe('profile authority validation',()=>{
 it('accepts optional aliases and complete factual governance proposals',()=>expect(()=>validateBusinessPartnerProfile({aliases:[alias],governanceRelations:[{clientItemKey:'member-1',definitionFieldCode:'governance',memberName:'Example Director',memberType:'individual',relationTypeCode:'director',ownershipPct:25}]})).not.toThrow());
 it.each(['tenantId','businessPartnerId','verifiedBy','status','approvedAt'])('rejects caller-owned %s',key=>expect(()=>validateBusinessPartnerProfile({aliases:[{...alias,[key]:'forged'}]})).toThrow(/unsupported field/));
 it('rejects impossible dates and percentages',()=>{
  expect(()=>validateBusinessPartnerProfile({aliases:[{...alias,effectiveFrom:'2026-02-30'}]})).toThrow(/valid date/);
  expect(()=>validateBusinessPartnerProfile({governanceRelations:[{clientItemKey:'m',definitionFieldCode:'governance',memberName:'Director',memberType:'individual',relationTypeCode:'director',ownershipPct:101}]})).toThrow(/between 0 and 100/);
 });
 it('accepts normalizable base-language and language-region alias tags but rejects unsupported subtags',()=>{
  expect(()=>validateBusinessPartnerProfile({aliases:[{...alias,languageCode:' EN-gb '}]})).not.toThrow();
  expect(()=>validateBusinessPartnerProfile({aliases:[{...alias,languageCode:'en_GB'}]})).toThrow(/language or locale/);
  expect(()=>validateBusinessPartnerProfile({aliases:[{...alias,languageCode:'zh-Hant-TW'}]})).toThrow(/language or locale/);
 });
});
