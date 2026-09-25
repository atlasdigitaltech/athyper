import {describe,it,expect} from 'vitest';
import {decisionViewArtifactKeys,decisionViewOverlay} from '../../scripts/db-verification/provisioning/decision-view-overlay.js';
describe('decision read-view publication overlay',()=>{
 it('retains unrelated artifacts and detail settings exactly',()=>{
  const unrelated={artifactKey:'bank/core',fields:[{key:'protected',secretPolicy:'unchanged'}]};
  const detail={artifactKey:'business_partner/presentation.detail',header:{titleField:'name'},sections:[{sectionKey:'banking',value:'untouched'}],dependencies:['bank/core'],navigation:{tabs:[{key:'360',sectionKeys:['banking','qualifications-certificates']},{key:'comments',sectionKey:'comments'}]}};
  const source=decisionViewArtifactKeys.map(artifactKey=>artifactKey.endsWith('presentation.detail')?{artifactKey,header:{titleField:'MUST_NOT_REPLACE'},sections:['qualifications-certificates','restrictions'].map(sectionKey=>({sectionKey,presentationRef:`business_partner/presentation.section.${sectionKey}.json`})),navigation:{tabs:[{key:'qualifications',sectionKeys:['qualifications-certificates','restrictions']}]}}:{artifactKey});
  const result=decisionViewOverlay([unrelated,detail],source);
  expect(result[0]).toEqual(unrelated);expect(result[1].header).toEqual(detail.header);
  expect(result[1].sections[0]).toEqual(detail.sections[0]);expect(result[1].navigation.tabs[0].sectionKeys).toEqual(['banking']);
  expect(detail.navigation.tabs[0].sectionKeys).toEqual(['banking','qualifications-certificates']);
 });
 it('rejects extra or missing artifact sources',()=>{expect(()=>decisionViewOverlay([],[])).toThrow('SCOPE_INVALID');});
});
