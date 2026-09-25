import {describe,it,expect} from "vitest";
import {matchPartnerDecision,matchDecisionScope,type ScopeRow} from "../partner-decision-scope.js";
const all=():ScopeRow[]=>['commercial_capacity','operating_organization','company_code','commodity_category','country'].map(scope_kind=>({scope_kind,scope_group:1,scope_mode:'include',selection_mode:'all',...(scope_kind==='country'?{country_purpose:'delivery'}:{})}));
const selected=(kind:string,field:string,value:string,group=1):ScopeRow=>({scope_kind:kind,scope_group:group,scope_mode:'include',selection_mode:'selected',[field]:value});
describe('explicit partner decision coverage',()=>{
 it('accepts explicit unrestricted coverage, not an empty lookup',()=>{expect(matchDecisionScope(all(),{})).toBe('match');expect(matchDecisionScope([],{})).toBe('context_required');});
 it('keeps company/category pairs within their group',()=>{
  const pair=(company:string,category:string,group:number)=>all().filter(r=>!['company_code','commodity_category'].includes(String(r.scope_kind))).map(r=>({...r,scope_group:group})).concat([selected('company_code','company_code_id',company,group),selected('commodity_category','commodity_category_id',category,group)]);
  const rows=[...pair('A','lab',1),...pair('B','IT',2)];
  expect(matchDecisionScope(rows,{companyCodeId:'A',commodityCategoryId:'lab'})).toBe('match');
  expect(matchDecisionScope(rows,{companyCodeId:'A',commodityCategoryId:'IT'})).toBe('no_match');
 });
 it('subtracts exclusions without widening other groups',()=>{expect(matchDecisionScope([...all(),{...selected('company_code','company_code_id','A'),scope_mode:'exclude'}],{companyCodeId:'A'})).toBe('no_match');});
 it('does not silently satisfy an exclusion with absent context',()=>{expect(matchDecisionScope([...all(),{...selected('country','country_code','MY'),country_purpose:'delivery',scope_mode:'exclude'}],{})).toBe('context_required');});
 it('distinguishes country purposes',()=>{const rows=all().filter(r=>r.scope_kind!=='country').concat({...selected('country','country_code','MY'),country_purpose:'service_performance'});expect(matchDecisionScope(rows,{countries:{delivery:'MY'}})).toBe('context_required');expect(matchDecisionScope(rows,{countries:{service_performance:'MY'}})).toBe('match');});
 it('does not turn category mappings into declared commodities',()=>{const rows=all().filter(r=>r.scope_kind!=='commodity_category').concat(selected('commodity_classification','commodity_classification_id','fact'));expect(matchDecisionScope(rows,{commodityCategoryId:'fact'})).toBe('context_required');});
 it('does not promote an event decision to standing',()=>{const row={context_kind:'contract',context_id:'C1',scopes:all()};expect(matchPartnerDecision(row,{})).toBe('context_required');expect(matchPartnerDecision(row,{contextKind:'contract',contextId:'C2'})).toBe('no_match');expect(matchPartnerDecision(row,{contextKind:'contract',contextId:'C1'})).toBe('match');});
 it('matches target-bound restrictions only to their document and line',()=>{const row={context_kind:'standing',restriction_mode:'target',target_entity_type:'invoice',target_entity_id:'I1',target_line_id:'L1',scopes:all()};expect(matchPartnerDecision(row,{targetEntityType:'invoice',targetEntityId:'I1'})).toBe('context_required');expect(matchPartnerDecision(row,{targetEntityType:'invoice',targetEntityId:'I2',targetLineId:'L1'})).toBe('no_match');expect(matchPartnerDecision(row,{targetEntityType:'invoice',targetEntityId:'I1',targetLineId:'L1'})).toBe('match');});
});
