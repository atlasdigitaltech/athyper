import { parseEntityReferencePage, type EntityReferencePageV1 } from "@athyper/contract-platform-entity-runtime";
import type {EntityViewCatalog} from "@athyper/contract-platform-entity-list";
import { parseInstant } from "@athyper/platform-temporal";
import { parseEntityApplicationDescriptor, type EntityApplicationDescriptorV1, parseEntityListDescriptor, parseEntityListResult, type EntityListDescriptorV1, type EntityListResultV1, type EntityListScopeCoordinateV1, type ListLocationStateV1 } from "@athyper/contract-platform-entity-list";
import type { Operation, RequestOptions } from "./index";

type EntityListParams = Readonly<Record<string, string | number>>;

/** The caller's own record of an owner-scoped entity (`/app/entity/{code}/me`). */
export const entityOwnRecordOperation: Operation<{ readonly recordId: string }> = Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/entity-runtime/${entityCode(params)}/own-record`,parse:(value:unknown)=>{const id=(value as {recordId?:unknown})?.recordId;if(typeof id!=="string"||!id||id.length>128||!/^[A-Za-z0-9_-]+$/.test(id))throw new TypeError("Invalid own record");return Object.freeze({recordId:id});},requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const entityApplicationDescriptorOperation: Operation<EntityApplicationDescriptorV1> = Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/entity-runtime/${entityCode(params)}/application-descriptor`,parse:parseEntityApplicationDescriptor,requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const entityListDescriptorOperation: Operation<EntityListDescriptorV1> = Object.freeze({ method: "GET", path: (params: EntityListParams) => `/api/entity-runtime/${entityCode(params)}/list-descriptor`, parse: (value: unknown) => {
  const descriptor = parseEntityListDescriptor(value);
  const raw = parseObject(value);
  return raw.viewCatalog === undefined ? descriptor : Object.freeze({ ...descriptor, viewCatalog: parseViewCatalog(raw.viewCatalog) });
}, requestClass: "interactive", idempotency: "forbidden", response: "json" });
/** Patches one record through the governed record operation (for example a
 * Tree move, blueprint B4): the If-Match version and Idempotency-Key are
 * required, and authorization, audit and integrity stay on the server. */
export const entityRecordPatchOperation: Operation<{ readonly recordId: string; readonly version?: number }, Readonly<Record<string, unknown>>> = Object.freeze({ method: "PATCH", path: (params: EntityListParams) => `/api/records/${entityCode(params)}/${encodeURIComponent(String(params["recordId"] ?? ""))}`, parse: (value: unknown) => { const item = value as { kind?: unknown; recordId?: unknown; version?: unknown }; if (!item || item.kind !== "Committed" || typeof item.recordId !== "string") throw new TypeError("Invalid record patch receipt"); return Object.freeze({ recordId: item.recordId, ...(typeof item.version === "number" ? { version: item.version } : {}) }); }, requestClass: "interactive", idempotency: "required", response: "json" });
export const entityListOperation: Operation<EntityListResultV1> = Object.freeze({ method: "GET", path: (params: EntityListParams) => `/api/entity-runtime/${entityCode(params)}/list`, parse: parseEntityListResult, requestClass: "interactive", idempotency: "forbidden", response: "json" });

export interface RecordBookmarkItemV1 { readonly description?: string; /** Current readable business code. */ readonly code?: string; /** Current readable status. */ readonly status?: string; readonly id: string; readonly entityCode: string; readonly recordId: string; readonly label?: string; readonly createdAt: string; }
export interface RecordBookmarkMutationV1 { readonly companyCodeIds?: string; readonly operatingOrganizationIds?: string; readonly partnerRole?: "supplier" | "customer"; readonly eligibleOperation?: "order" | "invoice" | "payment"; readonly records: readonly { readonly id: string; readonly label?: string }[]; readonly companyCodeId?: string; readonly legalEntityId?: string; readonly operatingOrganizationId?: string; readonly networkAccountId?: string; }
export const recordBookmarksOperation: Operation<readonly RecordBookmarkItemV1[]> = Object.freeze({ method: "GET", path: "/api/record-bookmarks", parse: parseBookmarks, requestClass: "interactive", idempotency: "forbidden", response: "json" });
export const recordBookmarkMembershipOperation: Operation<ReadonlySet<string>> = Object.freeze({ method: "GET", path: (params: EntityListParams) => `/api/record-bookmarks/${entityCode(params)}/membership`, parse: parseBookmarkMembership, requestClass: "interactive", idempotency: "forbidden", response: "json" });
export const addRecordBookmarksOperation: Operation<readonly string[], RecordBookmarkMutationV1> = Object.freeze({ method: "PUT", path: (params: EntityListParams) => `/api/record-bookmarks/${entityCode(params)}`, parse: parseBookmarkMutation, requestClass: "interactive", idempotency: "required", response: "json" });
export const removeRecordBookmarksOperation: Operation<readonly string[], RecordBookmarkMutationV1> = Object.freeze({ method: "DELETE", path: (params: EntityListParams) => `/api/record-bookmarks/${entityCode(params)}`, parse: parseBookmarkMutation, requestClass: "interactive", idempotency: "required", response: "json" });

export interface RecordExportRequest {
  readonly requestId: string;
  readonly filter: Readonly<Record<string, unknown>>;
}
export interface RecordExportReceipt { readonly exportRequestId: string; readonly jobId: string; readonly status: "queued"; }
export const requestRecordExportOperation: Operation<RecordExportReceipt, RecordExportRequest> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/${entityCode(params)}/exports`, parse: parseExportReceipt, requestClass: "background", idempotency: "required", response: "json" });

export type RecordImportMode = "create" | "update" | "upsert" | "delete" | "replace";
export interface BeginRecordImportRequest { readonly sessionId: string; readonly operation: RecordImportMode; readonly scopeCoordinate?: EntityListScopeCoordinateV1; readonly conflictPolicy?: "reject" | "skip"; readonly atomicity?: "all_or_nothing" | "valid_rows"; }
export interface RecordImportSessionReceipt { readonly id: string; readonly entityCode: string; readonly operation: RecordImportMode; readonly status: string; readonly stagedRowCount: number; readonly validRowCount: number; readonly invalidRowCount: number; }
export const beginRecordImportOperation: Operation<RecordImportSessionReceipt, BeginRecordImportRequest> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/${entityCode(params)}/imports`, parse: parseImportSession, requestClass: "upload", idempotency: "required", response: "json" });
export const appendRecordImportChunkOperation: Operation<Readonly<Record<string, unknown>>, { readonly rows: readonly Readonly<Record<string, unknown>>[] }> = Object.freeze({ method: "PUT", path: (params: EntityListParams) => `/api/records/imports/${uuidParam(params, "sessionId")}/chunks/${integerParam(params, "chunkIndex")}`, parse: parseObject, requestClass: "upload", idempotency: "required", response: "json" });
export const completeRecordImportUploadOperation: Operation<RecordImportSessionReceipt, { readonly expectedChunkCount: number }> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/imports/${uuidParam(params, "sessionId")}/complete`, parse: parseImportSession, requestClass: "upload", idempotency: "required", response: "json" });
export const prepareRecordImportWorkbookOperation:Operation<{readonly sessionId:string;readonly uploadUrl:string;readonly expiresInSeconds:number},{readonly fileName:string;readonly sizeBytes:number}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/workbook-upload`,parse:parseWorkbookUpload,requestClass:"upload",idempotency:"forbidden",response:"json"});
export const completeRecordImportWorkbookOperation:Operation<RecordImportSessionReceipt,{readonly fileName:string;readonly sizeBytes:number}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/workbook-complete`,parse:parseImportSession,requestClass:"background",idempotency:"required",response:"json"});
export const prepareRecordImportFileOperation:Operation<{readonly sessionId:string;readonly uploadUrl:string;readonly expiresInSeconds:number},{readonly fileName:string;readonly sizeBytes:number}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/file-upload`,parse:parseWorkbookUpload,requestClass:"upload",idempotency:"forbidden",response:"json"});
export const completeRecordImportFileOperation:Operation<RecordImportSessionReceipt,{readonly fileName:string;readonly sizeBytes:number}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/file-complete`,parse:parseImportSession,requestClass:"background",idempotency:"required",response:"json"});
export const downloadRecordImportWorkbookTemplateOperation:Operation<{readonly url:string;readonly expiresInSeconds:number}>=Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/records/${entityCode(params)}/import-template.xlsx`,parse:parseDownloadWithExpiry,requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const validateRecordImportOperation: Operation<RecordImportPreviewReceipt> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/imports/${uuidParam(params, "sessionId")}/validate`, parse: parseImportPreview, requestClass: "background", idempotency: "required", response: "json" });
export const previewRecordImportOperation: Operation<RecordImportPreviewReceipt> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/imports/${uuidParam(params, "sessionId")}/preview`, parse: parseImportPreview, requestClass: "background", idempotency: "required", response: "json" });
export const commitRecordImportOperation: Operation<{ readonly sessionId: string; readonly jobId: string; readonly status: "queued" }> = Object.freeze({ method: "POST", path: (params: EntityListParams) => `/api/records/imports/${uuidParam(params, "sessionId")}/commit`, parse: parseQueuedImport, requestClass: "background", idempotency: "required", response: "json" });
export interface RecordTransferProgressV1 { readonly stage:string;readonly completed:number;readonly total?:number;readonly percent?:number;readonly updatedAt:string; }
export interface RecordTransferReceiptV1 { readonly schemaVersion:1;readonly rowCount:number;readonly outcomeCounts?:Readonly<Record<string,number>>;readonly completedAt:string;readonly descriptorHash?:string;readonly checksum?:string; }
export interface RecordTransferItemV1 { readonly id:string;readonly kind:"import"|"export";readonly entityCode:string;readonly operation?:RecordImportMode;readonly status:string;readonly rowCount:number;readonly errorCount:number;readonly createdAt:string;readonly completedAt?:string;readonly downloadable:boolean;readonly progress?:RecordTransferProgressV1;readonly receipt?:RecordTransferReceiptV1;readonly errorCode?:string; }
/** One entity the caller may open, from GET /api/entity-runtime/directory. */
export interface EntityDirectoryItemV1 { readonly entityCode:string; readonly title:string; readonly description?:string; /** Records the caller may see; absent when not counted exactly. */ readonly count?:number; readonly iconKey?:string; readonly actions:readonly { readonly key:string; readonly label:string; readonly href:string }[]; }
/** Ask with `query: { entity: [...codes] }` (at most fifty); entities the caller may not list are left out. */
export const entityDirectoryOperation:Operation<readonly EntityDirectoryItemV1[]>=Object.freeze({method:"GET",path:"/api/entity-runtime/directory",parse:parseDirectory,requestClass:"interactive",idempotency:"forbidden",response:"json"});
function parseDirectory(value:unknown):readonly EntityDirectoryItemV1[]{
  const items=value&&typeof value==="object"&&Array.isArray((value as {items?:unknown}).items)?(value as {items:unknown[]}).items:undefined;
  if(!items)throw new TypeError("Entity directory items required");
  const text=(candidate:unknown,optional=false)=>{if(optional&&candidate===undefined)return undefined;if(typeof candidate!=="string"||!candidate.trim()||candidate.length>512)throw new TypeError("Invalid entity directory text");return candidate;};
  return Object.freeze(items.map(raw=>{
    const item=raw as Record<string,unknown>;
    if(!/^[a-z][a-z0-9_]{0,126}$/.test(String(item.entityCode))||!Array.isArray(item.actions))throw new TypeError("Invalid entity directory item");
    const description=text(item.description,true),iconKey=text(item.iconKey,true),count=typeof item.count==="number"&&Number.isSafeInteger(item.count)&&item.count>=0?item.count:undefined;
    return Object.freeze({entityCode:String(item.entityCode),title:text(item.title)!,...(description?{description}:{}),...(iconKey?{iconKey}:{}),...(count===undefined?{}:{count}),
      actions:Object.freeze(item.actions.map(rawAction=>{const action=rawAction as Record<string,unknown>,href=text(action.href)!;if(!href.startsWith("/")||href.startsWith("//"))throw new TypeError("Entity directory actions must be application paths");return Object.freeze({key:text(action.key)!,label:text(action.label)!,href});}))});
  }));
}
export const recordTransfersOperation:Operation<readonly RecordTransferItemV1[]>=Object.freeze({method:"GET",path:"/api/records/transfers",parse:parseTransfers,requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const cancelRecordImportOperation:Operation<{readonly sessionId:string;readonly status:string}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/cancel`,parse:(value:unknown)=>{const item=parseObject(value);return Object.freeze({sessionId:requiredText(item,"sessionId"),status:requiredText(item,"status")});},requestClass:"background",idempotency:"forbidden",response:"json"});
export const cancelRecordExportOperation:Operation<{readonly exportRequestId:string;readonly status:string}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/exports/${uuidParam(params,"exportRequestId")}/cancel`,parse:(value:unknown)=>{const item=parseObject(value);return Object.freeze({exportRequestId:requiredText(item,"exportRequestId"),status:requiredText(item,"status")});},requestClass:"background",idempotency:"forbidden",response:"json"});
export const restartRecordImportOperation:Operation<{readonly sessionId:string;readonly jobId:string;readonly status:string}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/restart`,parse:(value:unknown)=>{const item=parseObject(value);return Object.freeze({sessionId:requiredText(item,"sessionId"),jobId:requiredText(item,"jobId"),status:requiredText(item,"status")});},requestClass:"background",idempotency:"forbidden",response:"json"});
export const restartRecordExportOperation:Operation<{readonly exportRequestId:string;readonly jobId:string;readonly status:string}>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/records/exports/${uuidParam(params,"exportRequestId")}/restart`,parse:(value:unknown)=>{const item=parseObject(value);return Object.freeze({exportRequestId:requiredText(item,"exportRequestId"),jobId:requiredText(item,"jobId"),status:requiredText(item,"status")});},requestClass:"background",idempotency:"forbidden",response:"json"});
export const downloadRecordImportErrorsOperation:Operation<{readonly url:string}>=Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/records/imports/${uuidParam(params,"sessionId")}/error-report`,parse:parseDownload,requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const downloadRecordExportOperation:Operation<{readonly url:string}>=Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/records/exports/${uuidParam(params,"exportRequestId")}/download`,parse:parseDownload,requestClass:"interactive",idempotency:"forbidden",response:"json"});

export interface RecordImportPreviewReceipt { readonly sessionId: string; readonly validCount: number; readonly invalidCount: number; readonly rows: readonly { readonly rowNumber: number; readonly valid: boolean; readonly errors: readonly string[] }[]; }

/** One list request. `group`, `groupsOnly` and `hierarchy` are per request, not
 * saved state: the grouped tree and the Tree layout set them for each level
 * (Tree blueprint sections 5.1 and 5.3). */
export type EntityListQueryState = Pick<ListLocationStateV1, "standardViewKey" | "query" | "filters" | "sort" | "columns" | "cursor" | "pageSize"> & {
  readonly group?: string;
  /** Groups only, no rows; valid only with `group` and exact counts. */
  readonly groupsOnly?: boolean;
  /** A Summary request (Entity list Aggregate blueprint 5.4): also the total
   * over every group, from base rows. Valid only with `groupsOnly`. */
  readonly totals?: boolean;
  /** A Summary's column dimension (Aggregate A2), with `totals`: a declared
   * column entry, and the column values an expansion keeps. */
  readonly pivot?: string;
  readonly pivotValues?: readonly import("@athyper/contract-platform-entity-list").JsonValue[];
  readonly hierarchy?: "nodes" | "orphans" | "matches";
  /** Per-group aggregates as `field:aggregate` (Tree blueprint A2). */
  readonly aggregates?: readonly string[];
  /** The viewer's zone, for grouping a datetime field by month or quarter (A3). */
  readonly timeZone?: string;
  /** Restricts the request to these records (at most 100), for example the
   * Tree layout resolving a deep link's ancestors. */
  readonly recordIds?: readonly string[];
};

export function entityListQuery(state: EntityListQueryState, descriptor: EntityListDescriptorV1, scope?: EntityListScopeCoordinateV1): NonNullable<RequestOptions["query"]> {
  const query = state.query?.trim();
  return Object.freeze({
    ...(state.standardViewKey?{standardView:state.standardViewKey}:{}),
    limit: state.pageSize ?? descriptor.limits.defaultPageSize,
    ...(state.cursor ? { cursor: state.cursor } : {}),
    ...(query && query.length >= descriptor.surface.search.minimumQueryLength ? { search: query } : {}),
    ...(state.columns.length ? { fields: Object.freeze([...state.columns]) } : {}),
    ...(state.group ? { group: state.group } : {}),
    ...(state.groupsOnly ? { groupsOnly: "true" } : {}),
    ...(state.groupsOnly && state.totals ? { totals: "true" } : {}),
    ...(state.groupsOnly && state.totals && state.pivot ? { pivot: state.pivot } : {}),
    ...(state.groupsOnly && state.totals && state.pivot && state.pivotValues?.length ? { pivotValue: Object.freeze(state.pivotValues.map((value) => JSON.stringify(value))) } : {}),
    ...(state.group && state.aggregates?.length ? { aggregate: Object.freeze([...state.aggregates]) } : {}),
    ...(state.group && state.timeZone ? { timeZone: state.timeZone } : {}),
    ...(state.hierarchy ? { hierarchy: state.hierarchy } : {}),
    ...(state.recordIds?.length ? { recordIds: Object.freeze([...state.recordIds]) } : {}),
    ...(state.filters.length ? { filter: Object.freeze(state.filters.map((filter) => JSON.stringify(filter))) } : {}),
    ...(state.sort.length ? { sort: Object.freeze(state.sort.map((sort) => [sort.field, sort.direction, sort.nulls].filter(Boolean).join(":"))) } : {}),
    countMode: descriptor.limits.countMode,
    ...entityListScopeQuery(scope),
  });
}

export function entityListScopeQuery(scope?: EntityListScopeCoordinateV1): NonNullable<RequestOptions["query"]> {
  return Object.freeze({
    ...(scope?.parentEntityCode ? {parentEntityCode: scope.parentEntityCode, parentRecordId: scope.parentRecordId, relationshipKey: scope.relationshipKey} : {}),
    ...(scope?.parentDescriptorHash ? { parentDescriptorHash: scope.parentDescriptorHash } : {}),
    ...(scope?.companyCodeIds?.length ? { companyCodeIds: [...new Set(scope.companyCodeIds)].sort().join(",") } : {}),
    ...(scope?.operatingOrganizationIds?.length ? { operatingOrganizationIds: [...new Set(scope.operatingOrganizationIds)].sort().join(",") } : {}),
    ...(scope?.partnerRole ? {partnerRole:scope.partnerRole} : {}),
    ...(scope?.eligibleOperation ? {eligibleOperation:scope.eligibleOperation} : {}),
    ...(scope?.companyCodeId ? { companyCodeId: scope.companyCodeId } : {}),
    ...(scope?.legalEntityId ? { legalEntityId: scope.legalEntityId } : {}),
    ...(scope?.operatingOrganizationId ? { operatingOrganizationId: scope.operatingOrganizationId } : {}),
    ...(scope?.networkAccountId ? { networkAccountId: scope.networkAccountId } : {}),
  });
}

function entityCode(params: EntityListParams): string {
  const value = String(params.entityCode ?? "");
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(value)) throw new TypeError("entityCode must be a catalog code");
  return encodeURIComponent(value);
}

function parseObject(value: unknown): Readonly<Record<string, unknown>> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("record transfer response must be an object"); return Object.freeze({ ...(value as Record<string, unknown>) }); }
function parseBookmarks(value: unknown): readonly RecordBookmarkItemV1[] { const source = parseObject(value).items; if (!Array.isArray(source)) throw new TypeError("bookmark items are required"); return Object.freeze(source.map((candidate) => { const item = parseObject(candidate); const createdAt = requiredText(item, "createdAt"); if (Number.isNaN(parseInstant(createdAt))) throw new TypeError("bookmark createdAt is invalid"); return Object.freeze({ id: requiredText(item, "id"), entityCode: requiredText(item, "entityCode"), recordId: requiredText(item, "recordId"), ...(typeof item.description === "string" && item.description.trim() ? {description:item.description.trim()} : {}), ...(typeof item.code === "string" && item.code.trim() ? { code: item.code.trim() } : {}), ...(typeof item.status === "string" && item.status.trim() ? { status: item.status.trim() } : {}), ...(typeof item.label === "string" && item.label.trim() ? { label: item.label.trim() } : {}), createdAt }); })); }
function parseBookmarkMembership(value: unknown): ReadonlySet<string> { return new Set(bookmarkIds(parseObject(value), "bookmarkedRecordIds")); }
function parseBookmarkMutation(value: unknown): readonly string[] { return Object.freeze(bookmarkIds(parseObject(value), "recordIds")); }
function bookmarkIds(item: Readonly<Record<string, unknown>>, key: string): readonly string[] { const source = item[key]; if (!Array.isArray(source) || source.some((id) => typeof id !== "string")) throw new TypeError(`bookmark ${key} is invalid`); return source as readonly string[]; }
function requiredText(record: Readonly<Record<string, unknown>>, key: string): string { const value = record[key]; if (typeof value !== "string" || !value) throw new TypeError(`record transfer response.${key} is required`); return value; }
function requiredCount(record: Readonly<Record<string, unknown>>, key: string): number { const value = record[key]; if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`record transfer response.${key} must be a count`); return value; }
function parseExportReceipt(value: unknown): RecordExportReceipt { const item = parseObject(value), status = requiredText(item, "status"); if (status !== "queued") throw new TypeError("export status must be queued"); return Object.freeze({ exportRequestId: requiredText(item, "exportRequestId"), jobId: requiredText(item, "jobId"), status }); }
function parseImportSession(value: unknown): RecordImportSessionReceipt { const item = parseObject(value),operation=requiredText(item,"operation");if(operation!=="create"&&operation!=="update"&&operation!=="upsert"&&operation!=="delete"&&operation!=="replace")throw new TypeError("import operation is invalid");return Object.freeze({ id: requiredText(item, "id"), entityCode: requiredText(item, "entityCode"), operation, status: requiredText(item, "status"), stagedRowCount: requiredCount(item, "stagedRowCount"), validRowCount: requiredCount(item, "validRowCount"), invalidRowCount: requiredCount(item, "invalidRowCount") }); }
function parseImportPreview(value: unknown): RecordImportPreviewReceipt { const item = parseObject(value), source = item.rows; if (!Array.isArray(source)) throw new TypeError("import preview rows are required"); const rows = source.map((value) => { const row = parseObject(value); if (!Array.isArray(row.errors) || row.errors.some((error) => typeof error !== "string")) throw new TypeError("import preview errors are invalid"); return Object.freeze({ rowNumber: requiredCount(row, "rowNumber"), valid: row.valid === true, errors: Object.freeze([...row.errors]) as readonly string[] }); }); return Object.freeze({ sessionId: requiredText(item, "sessionId"), validCount: requiredCount(item, "validCount"), invalidCount: requiredCount(item, "invalidCount"), rows: Object.freeze(rows) }); }
function parseQueuedImport(value: unknown) { const item = parseObject(value), status = requiredText(item, "status"); if (status !== "queued") throw new TypeError("import status must be queued"); return Object.freeze({ sessionId: requiredText(item, "sessionId"), jobId: requiredText(item, "jobId"), status }); }
function parseWorkbookUpload(value:unknown){const item=parseObject(value);return Object.freeze({sessionId:requiredText(item,"sessionId"),uploadUrl:requiredText(item,"uploadUrl"),expiresInSeconds:requiredCount(item,"expiresInSeconds")});}
function parseTransfers(value:unknown):readonly RecordTransferItemV1[]{const source=parseObject(value)["items"];if(!Array.isArray(source))throw new TypeError("transfer items are required");return Object.freeze(source.map(candidate=>{const item=parseObject(candidate),kind=requiredText(item,"kind"),operation=typeof item["operation"]==="string"?item["operation"]:undefined;if(kind!=="import"&&kind!=="export")throw new TypeError("transfer kind is invalid");if(operation!==undefined&&!(["create","update","upsert","delete","replace"]as string[]).includes(operation))throw new TypeError("transfer operation is invalid");return Object.freeze({id:requiredText(item,"id"),kind,entityCode:requiredText(item,"entityCode"),...(operation?{operation:operation as RecordImportMode}:{}),status:requiredText(item,"status"),rowCount:requiredCount(item,"rowCount"),errorCount:requiredCount(item,"errorCount"),createdAt:requiredText(item,"createdAt"),...(typeof item["completedAt"]==="string"?{completedAt:item["completedAt"]}:{}),downloadable:item["downloadable"]===true,...parseTransferProgress(item["progress"]),...parseTransferReceipt(item["receipt"]),...(typeof item["errorCode"]==="string"?{errorCode:item["errorCode"]}:{})});}));}
function parseTransferProgress(value:unknown):{readonly progress?:RecordTransferProgressV1}{if(!value||typeof value!=="object"||Array.isArray(value)||!Object.keys(value).length)return{};const item=parseObject(value),completed=requiredCount(item,"completed"),total=typeof item["total"]==="number"?requiredCount(item,"total"):undefined,percent=typeof item["percent"]==="number"?item["percent"]:undefined,updatedAt=requiredText(item,"updatedAt");if(percent!==undefined&&(!Number.isFinite(percent)||percent<0||percent>100))throw new TypeError("transfer progress percent is invalid");return{progress:Object.freeze({stage:requiredText(item,"stage"),completed,...(total!==undefined?{total}:{}),...(percent!==undefined?{percent}:{}),updatedAt})};}
function parseTransferReceipt(value:unknown):{readonly receipt?:RecordTransferReceiptV1}{if(!value||typeof value!=="object"||Array.isArray(value)||!Object.keys(value).length)return{};const item=parseObject(value),schemaVersion=item["schemaVersion"];if(schemaVersion!==1)throw new TypeError("transfer receipt schema version is invalid");const rawCounts=item["outcomeCounts"],outcomeCounts=rawCounts&&typeof rawCounts==="object"&&!Array.isArray(rawCounts)?Object.freeze(Object.fromEntries(Object.entries(rawCounts).map(([key,count])=>{if(typeof count!=="number"||!Number.isSafeInteger(count)||count<0)throw new TypeError(`transfer outcome ${key} is invalid`);return[key,count];}))):undefined;return{receipt:Object.freeze({schemaVersion,rowCount:requiredCount(item,"rowCount"),...(outcomeCounts?{outcomeCounts}:{}),completedAt:requiredText(item,"completedAt")})};}
function parseDownload(value:unknown){return Object.freeze({url:requiredText(parseObject(value),"url")});}
function parseDownloadWithExpiry(value:unknown){const item=parseObject(value);return Object.freeze({url:requiredText(item,"url"),expiresInSeconds:requiredCount(item,"expiresInSeconds")});}
function uuidParam(params: EntityListParams, key: string): string { const value = String(params[key] ?? ""); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new TypeError(`${key} must be a UUID`); return encodeURIComponent(value); }
function integerParam(params: EntityListParams, key: string): string { const value = Number(params[key]); if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${key} must be a non-negative integer`); return String(value); }

function parseViewCatalog(value:unknown):EntityViewCatalog {
 const item=parseObject(value),caps=parseObject(item.capabilities);
 if(!Array.isArray(item.views))throw new TypeError("Invalid view catalog");
 return {views:item.views.map(raw=>{const view=parseObject(raw);if(!["personal","shared","system"].includes(String(view.scope))||typeof view.version!=="number")throw new TypeError("Invalid saved view");return {id:requiredText(view,"id"),name:requiredText(view,"name"),scope:view.scope as "personal"|"shared"|"system",version:view.version,compatible:view.compatible===true,state:view.state as EntityViewCatalog["views"][number]["state"]};}),...(typeof item.personalDefault==="string"?{personalDefault:item.personalDefault}:{}),...(typeof item.sharedDefault==="string"?{sharedDefault:item.sharedDefault}:{}),...(typeof item.createdId==="string"?{createdId:item.createdId}:{}),capabilities:{createShared:caps.createShared===true,manageShared:caps.manageShared===true,setSharedDefault:caps.setSharedDefault===true}};
}
export const entityViewsOperation:Operation<EntityViewCatalog>=Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/entity-runtime/${entityCode(params)}/views`,parse:parseViewCatalog,requestClass:"interactive",idempotency:"forbidden",response:"json"});
export const entityViewCommandOperation:Operation<EntityViewCatalog>=Object.freeze({method:"POST",path:(params:EntityListParams)=>`/api/entity-runtime/${entityCode(params)}/views`,parse:parseViewCatalog,requestClass:"interactive",idempotency:"forbidden",response:"json"});

export const entityReferenceChoicesOperation: Operation<EntityReferencePageV1> = Object.freeze({method:"GET",path:(params:EntityListParams)=>`/api/entity-runtime/${entityCode(params)}/references/${encodeURIComponent(String(params.fieldKey))}`,parse:parseEntityReferencePage,requestClass:"interactive",idempotency:"forbidden",response:"json"});
