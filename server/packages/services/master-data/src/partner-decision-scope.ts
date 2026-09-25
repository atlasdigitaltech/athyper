export type ScopeResult = "match" | "no_match" | "context_required";
export type ScopeRow = Readonly<Record<string, unknown>>;
export function publicDecisionScopes(rows:readonly ScopeRow[]):ScopeRow[]{
 const keys=['scope_group','scope_kind','scope_mode','selection_mode','commercial_capacity_code','operating_organization_id','company_code_id','commodity_category_id','commodity_classification_id','country_code','country_purpose','tax_jurisdiction_id','organization_unit_id','hierarchy_version','resolution_fingerprint'];
 return rows.map(row=>Object.fromEntries(keys.filter(key=>row[key]!=null).map(key=>[key,row[key]])));
}
export interface DecisionCoordinates {
  role?: string; operatingOrganizationId?: string; companyCodeId?: string;
  commodityCategoryId?: string; commodityClassificationId?: string;
  countries?: Readonly<Record<string,string>>;
  contextKind?: string; contextId?: string;
  targetEntityType?: string; targetEntityId?: string; targetLineId?: string;
}
const and=(values:ScopeResult[]):ScopeResult=>values.includes("no_match")?"no_match":values.includes("context_required")?"context_required":"match";
const or=(values:ScopeResult[]):ScopeResult=>values.includes("match")?"match":values.includes("context_required")?"context_required":"no_match";
const dimension=(row:ScopeRow)=>["commodity_category","commodity_classification"].includes(String(row.scope_kind))?"commodity":String(row.scope_kind);
function matchRow(row:ScopeRow,c:DecisionCoordinates):ScopeResult{
 if(row.selection_mode==="all")return "match";
 const fields:Record<string,[unknown,unknown]>={
  commercial_capacity:[row.commercial_capacity_code,c.role],operating_organization:[row.operating_organization_id,c.operatingOrganizationId],
  company_code:[row.company_code_id,c.companyCodeId],commodity_category:[row.commodity_category_id,c.commodityCategoryId],
  commodity_classification:[row.commodity_classification_id,c.commodityClassificationId],country:[row.country_code,c.countries?.[String(row.country_purpose)]],
 };
 const pair=fields[String(row.scope_kind)];
 if(!pair||pair[1]==null)return "context_required";
 return pair[0]===pair[1]?"match":"no_match";
}
/** OR between groups; AND between dimensions; exclusions subtract only from their group. */
export function matchDecisionScope(rows:readonly ScopeRow[],c:DecisionCoordinates):ScopeResult{
 if(!rows.length)return "context_required";
 const groups=new Map<unknown,ScopeRow[]>();for(const row of rows)groups.set(row.scope_group,[...(groups.get(row.scope_group)??[]),row]);
 return or([...groups.values()].map(group=>{
  const includes=group.filter(r=>r.scope_mode==="include"),excludes=group.filter(r=>r.scope_mode==="exclude");
  const dimensions=new Set(includes.map(dimension));
  if(!["commercial_capacity","operating_organization","company_code","commodity","country"].every(d=>dimensions.has(d)))return "context_required";
  const positive=and([...dimensions].map(d=>or(includes.filter(r=>dimension(r)===d).map(r=>matchRow(r,c)))));
  const negative=or(excludes.map(r=>matchRow(r,c)));
  return and([positive,negative==="match"?"no_match":negative==="context_required"?"context_required":"match"]);
 }));
}
export function matchDecisionContext(row:ScopeRow,c:DecisionCoordinates):ScopeResult{
 const values:ScopeResult[]=[];
 if(row.context_kind!=="standing")values.push(!c.contextKind||!c.contextId?"context_required":row.context_kind===c.contextKind&&row.context_id===c.contextId?"match":"no_match");
 if(row.restriction_mode==="target"){
  values.push(!c.targetEntityType||!c.targetEntityId?"context_required":row.target_entity_type===c.targetEntityType&&row.target_entity_id===c.targetEntityId?"match":"no_match");
  if(row.target_line_id)values.push(!c.targetLineId?"context_required":row.target_line_id===c.targetLineId?"match":"no_match");
 }
 return and(values);
}
export function matchPartnerDecision(row:ScopeRow,c:DecisionCoordinates):ScopeResult{
 return and([matchDecisionContext(row,c),matchDecisionScope(Array.isArray(row.scopes)?row.scopes:[],c)]);
}
