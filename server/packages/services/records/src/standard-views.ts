import type { EffectiveStandardViewV1, PublishedStandardViewV1 } from "@athyper/contract-platform-entity-list";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, StandardViewRelationshipConstraint } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";

/** Relational providers leave pagination and counts to the authorized list executor. */
export interface StandardViewSource {
 readonly kind: "recently_viewed" | "approval_tasks" | "request_documents";
 available(context: VerifiedRequestContext, view: PublishedStandardViewV1, descriptor: EntityRuntimeDescriptor): Promise<boolean>;
 resolve(context: VerifiedRequestContext, view: PublishedStandardViewV1): Promise<readonly string[] | {readonly relationships: readonly StandardViewRelationshipConstraint[]}>;
}
export type StandardViewSources = Readonly<Record<string, StandardViewSource>>;
export async function availableStandardViews(context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, sources: StandardViewSources = {}): Promise<readonly EffectiveStandardViewV1[]> {
 const result: EffectiveStandardViewV1[] = [];
 for (const view of descriptor.listPresentation?.experience?.standardViews ?? []) {
  if (view.entityCode !== descriptor.entityCode) continue;
  if (view.provider === "ownership") {
   const field = descriptor.fields.find(field => field.key === view.ownerField);
   if (!field || !field.filterable) continue;
  } else {
   const source = sources[view.providerKey!];
   if (!source || source.kind !== view.provider || !await source.available(context, view, descriptor)) continue;
  }
  result.push({key:view.key,label:view.label,position:view.position});
 }
 return result;
}
export async function resolveStandardView(query: ListRecordsQuery, descriptor: EntityRuntimeDescriptor, sources: StandardViewSources = {}): Promise<ListRecordsQuery> {
 if (!query.standardViewKey) return query;
 const available = await availableStandardViews(query.context,descriptor,sources);
 if (!available.some(view=>view.key===query.standardViewKey)) throw new RecordServiceError(409,"STANDARD_VIEW_UNAVAILABLE","This standard view is not available for the current collection and user");
 const view=descriptor.listPresentation!.experience!.standardViews!.find(view=>view.key===query.standardViewKey)!;
 if (view.provider==="ownership") return {...query,filters:[...(query.filters??[]),{field:view.ownerField!,operator:"eq",value:query.context.principalId}]};
 const resolved=await sources[view.providerKey!]!.resolve(query.context,view);
 if ("relationships" in resolved) {
  if (!resolved.relationships.length) throw new RecordServiceError(409,"STANDARD_VIEW_UNAVAILABLE","The view has no relationship binding");
  return {...query,viewRelationships:[...(query.viewRelationships??[]),...resolved.relationships]};
 }
 if (view.provider !== "recently_viewed") throw new RecordServiceError(409,"STANDARD_VIEW_UNAVAILABLE","This view requires a server-side relationship provider");
 const ids=resolved;
 if(ids.length>100)throw new RecordServiceError(409,"STANDARD_VIEW_RESULT_LIMIT","This provider must support the complete result set before the view can be used");
 return {...query,recordIds:query.recordIds?ids.filter(id=>query.recordIds!.includes(id)):ids};
}

/** Built-in adapters are selected by published bindings, never by entity names. */
export function createRelationshipStandardViewSources(authorizer: Authorizer): StandardViewSources {
 return {
  "document.case_requests.v1": {
   kind:"request_documents",
   available:async (_context,view,descriptor)=>Boolean(view.requestBinding && descriptor.storage.schema === "document" && descriptor.storage.object === "entity_case" && descriptor.storage.idField === "id" && descriptor.storage.tenantField === "tenant_id"),
   resolve:async(context,view)=>({relationships:[{kind:"document.case_requests.v1",...(view.requestBinding!.requester ? {principalId:context.principalId}:{}),
    ...(view.requestBinding!.operationCodes ? {operationCodes:view.requestBinding!.operationCodes}:{}),...(view.requestBinding!.role ? {role:view.requestBinding!.role}:{})}]}),
  },
  "workflow.actionable_documents.v1": {
   kind:"approval_tasks",
   available:async(context,view,descriptor)=>Boolean(descriptor.storage.tenantField && view.approvalBinding && (await authorizer.authorize({context,permissionCode:view.approvalBinding.permissionCode})).allowed),
   resolve:async(context,view)=>({relationships:[{kind:"workflow.actionable_documents.v1",principalId:context.principalId,sourceEntityCode:view.approvalBinding!.sourceEntityCode,
    workflowKeys:view.approvalBinding!.workflowKeys,workTypeCodes:view.approvalBinding!.workTypeCodes,link:view.approvalBinding!.link}]}),
  },
 };
}
