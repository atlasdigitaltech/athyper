/** Explicit DEV view slice. Carry every unrelated active artifact forward. */
export const decisionViewArtifactKeys = [
  "business_partner_qualification/core",
  "business_partner_restriction/core",
  "business_partner/presentation.section.qualifications-certificates",
  "business_partner/presentation.section.restrictions",
  "business_partner/presentation.detail",
] as const;
type Json = Record<string, any>;
export function decisionViewOverlay(baseline: readonly Json[], sources: readonly Json[]): Json[] {
  const source = new Map(sources.map(value=>[value.artifactKey,value]));
  if (source.size!==decisionViewArtifactKeys.length || decisionViewArtifactKeys.some(key=>!source.has(key))) throw Error("DECISION_VIEW_OVERLAY_SCOPE_INVALID");
  const result=baseline.map(value=>structuredClone(value));
  for(const key of decisionViewArtifactKeys.slice(0,-1)) {
    const next=structuredClone(source.get(key)!);
    const index=result.findIndex(value=>value.artifactKey===key);
    if(index<0)result.push(next);else result[index]=next;
  }
  const detail=result.find(value=>value.artifactKey==="business_partner/presentation.detail");
  const proposed=source.get("business_partner/presentation.detail")!;
  if(!detail?.navigation?.tabs)throw Error("DECISION_VIEW_NAVIGATION_REQUIRED");
  for(const key of ["qualifications-certificates","restrictions"]) {
    const section=proposed.sections.find((s:Json)=>s.sectionKey===key);
    if(!section)throw Error("DECISION_VIEW_SECTION_REQUIRED");
    const index=detail.sections.findIndex((s:Json)=>s.sectionKey===key);
    if(index<0)detail.sections.push(section);else detail.sections[index]=section;
    const dependency=section.presentationRef.replace(/\.json$/,"");
    if(!detail.dependencies.includes(dependency))detail.dependencies.push(dependency);
  }
  // Move only these destinations; preserve every unrelated tab and 360 setting.
  for(const tab of detail.navigation.tabs) if(Array.isArray(tab.sectionKeys) && tab.key!=="qualifications")
    tab.sectionKeys=tab.sectionKeys.filter((key:string)=>!["qualifications-certificates","restrictions"].includes(key));
  const tab=proposed.navigation.tabs.find((t:Json)=>t.key==="qualifications");
  if(!tab)throw Error("DECISION_VIEW_TAB_REQUIRED");
  const index=detail.navigation.tabs.findIndex((t:Json)=>t.key==="qualifications");
  if(index<0)detail.navigation.tabs.splice(1,0,tab);else detail.navigation.tabs[index]=tab;
  return result;
}
