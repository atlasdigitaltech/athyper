import { randomUUID } from "node:crypto";
import {
  emptyReferenceMembers, normalizedCoreMembers, normalizedLayoutMembers,
  validateNormalizedCoreRow, validateNormalizedLayoutRow,
  type ExpandedNativeMetaEntityGraph, type NormalizedCoreContext,
  type NormalizedCoreKind, type NormalizedCoreRow, type NormalizedLayoutKind,
  type NormalizedLayoutRow, type OwnedLabelGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import type { EntityRuntimeLocalizedTextV1 } from "@athyper/contract-platform-entity-runtime";
import { compileSharedReferenceProduct, type SharedReferenceProduct } from "./product.js";
import { sha256 } from "../deterministic.js";
import { validateNativeSnapshotReferences } from "../native-snapshot-validation.js";
import { importNativeStructuralGraph } from "../native-structural-codec.js";

/** Pure product authoring, not installation or approval. Storage facts and component
 * selection are explicit host inputs. IDs are allocated once and serialized in the
 * proposal; execution/replay must consume that proposal rather than rebuild it. */
export interface NativeReferenceProductInput {
  product: SharedReferenceProduct;
  entityId: string;
  changeSetId: string;
  authorId: string;
  createdAt: string;
  authoringSchemaHash: string;
  catalogue: NormalizedCoreContext["catalogues"][number];
  components: {list: string; detail: string; displays: Readonly<Record<string,string>>};
  targets: readonly {entityId:string;entityCode:string;keyKey:string;fieldKeys:readonly string[];labelFieldKey:string}[];
  allocateId?: () => string;
}
function core<K extends NormalizedCoreKind>(kind:K,id:string,values:Record<string,unknown>):NormalizedCoreRow<K> {
  const row={id,...Object.fromEntries(Object.keys(normalizedCoreMembers[kind].columns).map(k=>[k,null])),...values} as NormalizedCoreRow<K>;
  validateNormalizedCoreRow(kind,row); return row;
}
function layout<K extends NormalizedLayoutKind>(kind:K,id:string,values:Record<string,unknown>):NormalizedLayoutRow<K> {
  const row={id,...Object.fromEntries(Object.keys(normalizedLayoutMembers[kind].columns).map(k=>[k,null])),...values} as NormalizedLayoutRow<K>;
  validateNormalizedLayoutRow(kind,row); return row;
}
export function buildNativeReferenceProduct(input: NativeReferenceProductInput): ExpandedNativeMetaEntityGraph {
  const d=input.product.definition, plane=input.catalogue.plane;
  const fail=(path:string):never=>{throw Error("NATIVE_REFERENCE_PRODUCT_UNSUPPORTED:"+path);};
  if (!input.product.planes.includes(plane) || input.catalogue.schema!=="shared" || input.catalogue.object!==d.storageObject) fail("catalogue");
  if (d.capabilities?.length || d.summaryView) fail("capabilities-or-summaryView");
  if (!d.navigation?.tabs?.length || !d.localizedTitle || !d.entityLabel) fail("explicit-presentation");
  const allocated=new Set<string>();
  const alloc=()=>{const value=(input.allocateId??randomUUID)(); if(allocated.has(value)) fail("duplicate-id"); allocated.add(value);return value;};
  const source=structuredClone(compileSharedReferenceProduct(input.product,plane,2).graph);
  const ids=new Map<string,string>();
  for(const rows of Object.values(source)) if(Array.isArray(rows)) for(const r of rows) if(r && typeof r==="object" && "id" in r && typeof r.id==="string") ids.set(r.id,alloc());
  const remap=(v:unknown):unknown=>Array.isArray(v)?v.map(remap):v&&typeof v==="object"?Object.fromEntries(Object.entries(v).map(([k,val])=>[k,remap(val)])):typeof v==="string"?(ids.get(v)??v):v;
  const legacy=remap(source) as typeof source;
  for(const rows of Object.values(legacy)) if(Array.isArray(rows)) for(const r of rows) if(r && typeof r==="object" && !("id" in r)) Object.assign(r,{id:alloc()});
  const labels: OwnedLabelGraph={contract:"entity.authoring-owned-labels/1",entityId:input.entityId,tenantId:null,changeSetId:input.changeSetId,defaultLocale:"en",requiredLocales:["en"],labels:[],translations:[]};
  const label=(text:EntityRuntimeLocalizedTextV1|undefined)=>{
    if(!text) return fail("localized-label");
    const existing=labels.labels.find(l=>l.labelKey===text.labelKey);
    if(existing){if(existing.defaultText!==text.defaultText) fail("conflicting-label:"+text.labelKey);return existing.id;}
    const row={id:alloc(),labelKey:text.labelKey,defaultText:text.defaultText,sourceKind:"owned" as const,sharedLabelKey:null,sharedResourceKey:null,sharedResourceVersion:null,sharedResourceHash:null};
    (labels.labels as typeof row[]).push(row);return row.id;
  };
  const fieldId=(key:string)=>legacy.fields.find(f=>f.fieldKey===key)?.id??fail("field:"+key);
  const operationId=(key:string)=>legacy.operations.find(o=>o.operationKey===key)?.id??fail("operation:"+key);
  const identities=d.fields.map(f=>({id:alloc(),entityId:input.entityId,tenantId:null,fieldKey:f.key,parentIdentityId:null,identityStatus:"reserved" as const,introducedChangeSetId:input.changeSetId,firstReleaseId:null,retiredAt:null,retiredBy:null,retirementReleaseId:null,replacementIdentityId:null,createdAt:input.createdAt,createdBy:input.authorId}));
  const references=structuredClone(emptyReferenceMembers());
  const relationByField=new Map<string,string>();
  const relations:NonNullable<typeof legacy.relations>[number][]=[];
  const relationTargets:NonNullable<typeof legacy.relationTargets>[number][]=[];
  const relationFields:NonNullable<typeof legacy.relationFields>[number][]=[];
  for(const f of d.fields) if(f.keyReference){
    const ref=f.keyReference;
    const matches=input.targets.filter(t=>t.entityCode===ref.targetEntity && t.labelFieldKey===ref.labelField && JSON.stringify(t.fieldKeys)===JSON.stringify(ref.fields.map(m=>m.target)));
    if(matches.length!==1) fail("relation-target:"+f.key);
    const t=matches[0]!,rid=alloc(),tid=alloc();relationByField.set(f.key,rid);
    relations.push({id:rid,relationKey:f.key,relationKind:"many_to_one",resolutionKind:"logical",ownershipMode:"reference",mutationMode:"read_only",onDelete:"restrict",onUpdate:"restrict",status:"active"});
    relationTargets.push({id:tid,entityRelationId:rid,relationTargetKey:"default",targetEntityId:t.entityId,targetEntityCode:t.entityCode,targetKeyKey:t.keyKey,isDefault:true});
    relationFields.push(...ref.fields.map((m,i)=>({id:alloc(),entityRelationTargetId:tid,sourceFieldId:fieldId(m.source),targetFieldKey:m.target,position:i+1})));
  }
  const fields=d.fields.map((f,i)=>{
    const columns=input.catalogue.columns.filter(c=>c.path===f.key);
    if(columns.length!==1 || !columns[0]!.supportedDataTypes.includes(f.type) || columns[0]!.nullable===Boolean(f.required)) fail("storage-field:"+f.key);
    const column=columns[0]!;
    return core("field",fieldId(f.key),{fieldIdentityId:identities[i]!.id,labelId:label(f.localizedLabel),dataType:f.type,storageType:column.storageType,cardinality:"one",valueOrigin:"stored",storageKind:"column",storagePath:f.key,nullable:column.nullable,required:false,writeMode:"read_only",dataClassification:"public",defaultKind:"none",keyGeneration:f.type==="uuid"?"provided":"none",domainCode:f.domainCode??null,semanticRole:f.semanticRole??null,relationId:relationByField.get(f.key)??null});
  });
  for(const f of d.fields) for(const [i,c] of (f.choices??[]).entries()) references.members.fieldChoice.push({id:alloc(),entityFieldId:fieldId(f.key),valueText:c.value,labelId:label(c.localizedLabel),tone:c.tone??null,position:i+1});
  const listSource=legacy.surfaces!.find(s=>s.surfaceKind==="list")!,detailSource=legacy.surfaces!.find(s=>s.surfaceKind==="detail")!;
  const config=listSource.layoutConfig!;
  const limits=config.limits as {defaultPageSize:number;allowedPageSizes:number[];maxSortLevels:number;countMode:string};
  const surfaces=[core("surface",listSource.id!,{surfaceKey:listSource.surfaceKey,surfaceKind:"list",labelId:label(d.localizedTitle),layoutKind:"stack",isDefault:true,componentContractId:input.components.list,iconKey:d.iconKey??null,identityFieldId:fieldId(d.codeField),searchProfileId:legacy.searchProfiles![0]!.id,supportedModes:config.supportedModes,defaultPageSize:limits.defaultPageSize,allowedPageSizes:limits.allowedPageSizes,maxSortLevels:limits.maxSortLevels,countMode:limits.countMode,maxFilters:20,maxFilterDepth:1,maxPageSize:100}),core("surface",detailSource.id!,{surfaceKey:detailSource.surfaceKey,surfaceKind:"detail",labelId:label(d.localizedTitle),layoutKind:"stack",isDefault:true,componentContractId:input.components.detail,iconKey:d.iconKey??null,titleFieldId:fieldId(d.titleField),codeFieldId:fieldId(d.codeField),columnCount:2,showGroupBand:false})];
  const sections:NormalizedLayoutRow<"section">[]=[];
  const bindings:NormalizedLayoutRow<"binding">[]=[];
  const bind=(key:string,surfaceId:string,position:number,sectionId:string|null,kind:"field"|"badge"="field")=>{
    const f=d.fields.find(f=>f.key===key)??fail("binding-field:"+key);
    if(f.type==="uuid") fail("visible-uuid:"+key);
    const component=input.components.displays[f.type]??fail("display-component:"+f.type);
    const row=layout("binding",alloc(),{entitySurfaceId:surfaceId,entitySurfaceSectionId:sectionId,entityFieldId:fieldId(key),bindingKey:kind==="badge"?"badge_"+key:key,bindingKind:kind,position,columnSpan:1,componentDisplayId:component,meaningfulForForm:false}); bindings.push(row);return row;
  };
  // Readable list fields remain available for supported saved views, excluding
  // technical identity by explicit definition type; published UUID placement rejects.
  for(const key of d.columns) if(d.fields.find(f=>f.key===key)?.type==="uuid") fail("visible-uuid:"+key);
  d.fields.filter(f=>f.type!=="uuid").forEach((f,i)=>bind(f.key,listSource.id!,i+1,null));
  for(const [i,tab] of d.navigation.tabs.entries()){
    if(!tab.localizedLabel) fail("navigation-label");
    const groupId=alloc();references.members.navigationGroup.push({id:groupId,entitySurfaceId:detailSource.id!,groupKey:tab.key,labelId:label(tab.localizedLabel),iconKey:null,sectionDisplay:d.navigation.mode==="scroll"?"continuous":"tabs",position:i+1});
    tab.sectionKeys.forEach((key,j)=>{
      const section=d.sections.find(s=>s.key===key)??fail("navigation-section:"+key),sid=alloc();
      if(sections.some(s=>s.sectionKey===key)) fail("duplicate-section:"+key);
      sections.push(layout("section",sid,{entitySurfaceId:detailSource.id!,navigationGroupId:groupId,sectionKey:key,labelId:label(section.localizedLabel),sectionKind:"section",contentKind:"fields",position:j+1,columnCount:2,collapsible:false,collapsedByDefault:false,placement:"direct",iconKey:section.iconKey??null}));
      section.fields.forEach((key,k)=>bind(key,detailSource.id!,k+1,sid));
    });
  }
  if(sections.length!==d.sections.length) fail("unplaced-sections");
  d.fields.filter(f=>f.semanticRole==="status").forEach((f,i)=>bind(f.key,detailSource.id!,i+1,null,"badge"));
  const defaultState=config.defaultState as {sort:{field:string;direction:"asc"|"desc"}[];density:"comfortable";mode:"table"};
  const viewId=alloc();
  references.members.surfaceView.push({id:viewId,entitySurfaceId:listSource.id!,viewKey:"default",viewKind:"default",labelId:null,descriptionLabelId:null,mode:defaultState.mode,density:defaultState.density,isDefault:true,position:1});
  const viewKeys=[...new Set([...d.columns,...defaultState.sort.map(s=>s.field)])];
  viewKeys.forEach(key=>{
    const b=bindings.find(b=>b.entitySurfaceId===listSource.id && b.entityFieldId===fieldId(key))??fail("view-binding:"+key);
    const visible=d.columns.indexOf(key),sort=defaultState.sort.findIndex(s=>s.field===key);
    references.members.surfaceViewField.push({id:alloc(),entitySurfaceViewId:viewId,surfaceFieldBindingId:b.id,visible:visible>=0,position:visible>=0?visible+1:null,sortPosition:sort>=0?sort+1:null,sortDirection:sort>=0?defaultState.sort[sort]!.direction:null,groupPosition:null,groupDirection:null,width:null});
  });
  references.members.target.push({id:alloc(),targetPlane:plane,requirement:"required",position:1});
  const operations=legacy.operations.map(o=>{
    const binding=d.runtimeBindings?.find(b=>b.operation===o.operationKey)??fail("operation-binding:"+o.operationKey);
    return {id:o.id!,operationKey:o.operationKey,operationKind:"read" as const,labelId:label({labelKey:"operation."+o.operationKey,defaultText:o.label}),description:null,auditEventCode:o.auditEventCode,executionMode:"synchronous" as const,idempotencyMode:"none" as const,inputSurfaceId:null,resultSurfaceId:null,authorizationTarget:o.operationKey==="list"?"collection" as const:"existing" as const,authorizationEffect:"read" as const,requiresParentRead:false,requiresPreflight:false,replacementOperationId:null,handlerKey:binding.handler,handlerVersion:1,preflightKey:null,preflightVersion:null,extensionFieldMode:"none" as const,exportFormats:null,exportMaxRecords:null};
  });
  const auth=config.authorization as {ownership:string;fieldPolicies:{fields:string[];readOperation:string;representation:"plain";queryUses:("search"|"filter"|"sort"|"group")[]}[];directory:{operation:string};recordReadOperation:string};
  references.members.authorizationProfile.push({id:alloc(),targetPlane:plane,ownershipResolverKey:auth.ownership,ownershipResolverVersion:1,recordReadOperationId:operationId(auth.recordReadOperation),directoryOperationId:operationId(auth.directory.operation),directoryPopulation:"tenant",ownerFieldId:null,createdByFieldId:null,updatedByFieldId:null,administerPermissionCode:null,administerPermissionKind:null});
  for(const f of d.fields){const policies=auth.fieldPolicies.filter(p=>p.fields.includes(f.key));if(policies.length!==1) fail("field-policy:"+f.key);const p=policies[0]!;references.members.fieldAccess.push({id:alloc(),entityFieldId:fieldId(f.key),targetPlane:plane,readOperationId:operationId(p.readOperation),representation:p.representation,queryUses:p.queryUses,readOperationChangeSetId:input.changeSetId});}
  const runtime=core("runtime",legacy.runtimeProfiles![0]!.id!,{profileKey:"default",backingKind:"table",storagePlane:plane,storageSchema:input.catalogue.schema,storageObject:input.catalogue.object,storageCatalogueHash:input.catalogue.hash,readMode:"generic",writeMode:"none",apiExposure:"api",createMode:"form_only",concurrencyMode:"none",idFieldId:fieldId("id"),referenceCapabilityKey:config.referenceCapability,referenceCapabilityVersion:1});
  const structural=importNativeStructuralGraph({...legacy,relations,relationTargets,relationFields},{fieldIds:fields.map(f=>f.id),targets:input.targets});
  const graph:ExpandedNativeMetaEntityGraph={contractSchema:"athyper.meta-entity-contract/2.5",entity:{...legacy.entity,entityLabelId:label(d.entityLabel)},authoringSource:{entityId:input.entityId,tenantId:null,sourceKind:"product",authoringSchemaHash:input.authoringSchemaHash},ownedLabels:labels,fieldIdentities:identities,fields,operations,runtimeProfiles:[runtime],surfaces,surfaceSections:sections,surfaceFieldBindings:bindings,referenceMembers:references,...structural,ai:{profile:[],field:[],binding:[],reference:[],term:[]}};
  if(d.ai){
    const a=d.ai;if(a.vocabulary) fail("ai.vocabulary");const pid=alloc();
    graph.ai.profile.push({id:pid,enabled:a.enabled,description:a.description??null,aliases:[...a.aliases],contextKinds:[...a.contextKinds],searchProfileId:a.searchFieldKeys.length?legacy.searchProfiles![0]!.id!:null,vocabularyLocale:null});
    if(JSON.stringify(a.searchFieldKeys)!==JSON.stringify(d.searchFields)) fail("ai.search");
    a.summaryFieldKeys.forEach((key,i)=>graph.ai.field.push({id:alloc(),aiProfileId:pid,entityFieldId:fieldId(key),position:i+1}));
    for(const [kind,entries] of [["insight_provider",a.insightProviders],["action",a.actions],["presentation_profile",a.presentationProfiles]] as const) entries.forEach((b,i)=>graph.ai.binding.push({id:alloc(),aiProfileId:pid,bindingKind:kind,contractKey:b.id,contractVersion:b.version,required:"required" in b?b.required??null:null,operationId:"operationKey" in b?operationId(b.operationKey):null,position:i+1}));
    a.relationshipKeys.forEach((key,i)=>graph.ai.reference.push({id:alloc(),aiProfileId:pid,referenceKind:"entity_relation",relationId:relationByField.get(key)??fail("ai.relationship:"+key),sourceFieldId:fieldId(key),collectionContractKey:null,collectionContractVersion:null,position:i+1}));
  }
  validateNativeSnapshotReferences(graph,{entityId:input.entityId,changeSetId:input.changeSetId,tenantId:null},10000);
  return graph;
}
