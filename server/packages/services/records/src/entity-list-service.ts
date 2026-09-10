import { parseEntityRecordPresentation, readableRecordPresentation } from "@athyper/contract-platform-entity-runtime";
import { createRelationshipStandardViewSources, availableStandardViews, resolveStandardView, type StandardViewSources } from "./standard-views.js";
import { effectiveListActions, effectiveEntityNavigation, type EntityAttentionCountResolver } from "./list-experience.js";
import { resolveEntityText, type EffectiveListActionV1, type EffectiveEntitySectionV1 } from "@athyper/contract-platform-entity-list";
import { createHash } from "node:crypto";
import type { EntityListDataOperationsV1, EntityListDescriptorV1, EntityListResultV1, JsonValue, ListFieldDescriptorV1, ListFilterOperator, ListFilterV1, ListSortV1, ListViewMode } from "@athyper/contract-platform-entity-list";
import type { EntityDetailDescriptorV1, EntityFormDescriptorV1, EntityRecordV1, EntitySurfaceFieldV1 } from "@athyper/contract-platform-entity-runtime";
import type { Authorizer, EffectiveAuthorizationScope, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { EntityFieldDescriptor, EntityListDefaultStateDescriptor, EntityRuntimeDescriptor, MetadataReader } from "@athyper/server-contract-metadata";
import type { ListRecordsQuery, RecordCollectionScopeResolution, RecordCollectionScopeResolver, RecordQueryService } from "@athyper/server-contract-records";
import { RecordServiceError } from "./errors.js";
import { recordFieldFilterOperators } from "./list-query-policy.js";
import { descriptorFor, type RecordListExecutor } from "./query-service.js";
import { authorizeRecordListRead, readableRecordFields } from "./record-read-access.js";

export interface EntityListService {
  applicationDescriptor(context:VerifiedRequestContext,entityCode:string,scopeCoordinate?:ListRecordsQuery["scopeCoordinate"]):Promise<import("@athyper/contract-platform-entity-list").EntityApplicationDescriptorV1>;
  descriptor(context: VerifiedRequestContext, entityCode: string, scopeCoordinate?: ListRecordsQuery["scopeCoordinate"], filterChoiceField?: string): Promise<EntityListDescriptorV1>;
  formDescriptor(context: VerifiedRequestContext, entityCode: string, mode: "create" | "edit"): Promise<EntityFormDescriptorV1>;
  detailDescriptor(context: VerifiedRequestContext, entityCode: string, recordId?: string): Promise<EntityDetailDescriptorV1>;
  record(context: VerifiedRequestContext, entityCode: string, recordId: string): Promise<EntityRecordV1>;
  list(query: ListRecordsQuery): Promise<EntityListResultV1>;
}

export const ENTITY_LIST_MAX_SORT_LEVELS = 3;

export function createEntityListService(options: { readonly filterChoices?: (context: VerifiedRequestContext, fields: readonly EntityFieldDescriptor[]) => Promise<Readonly<Record<string, NonNullable<ListFieldDescriptorV1["filterOptions"]>>>>; readonly standardViewSources?: StandardViewSources; readonly metadata: MetadataReader; readonly authorizer: Authorizer; readonly listExecutor: RecordListExecutor; readonly queries?: RecordQueryService; readonly collectionScopes?: RecordCollectionScopeResolver; readonly attentionCounts?: Readonly<Record<string, EntityAttentionCountResolver>> }): EntityListService {
  const standardViewSources = {...createRelationshipStandardViewSources(options.authorizer), ...options.standardViewSources};
  return Object.freeze({
    async applicationDescriptor(context:VerifiedRequestContext,entityCode:string,scopeCoordinate?:ListRecordsQuery["scopeCoordinate"]) {
      const descriptor=await descriptorFor(options.metadata,context,entityCode),collectionScope=await resolveCollectionScope(options.collectionScopes,context,descriptor,scopeCoordinate);
      if(collectionScope.status==="forbidden")throw new RecordServiceError(403,collectionScope.code,collectionScope.message);
      const actions=await effectiveListActions(options.authorizer,context,descriptor,collectionScope),navigation=await effectiveEntityNavigation(options.authorizer,context,descriptor,collectionScope,options.attentionCounts);
      const experience=descriptor.listPresentation?.experience;
      if(experience?.application) { if(!navigation.length && !actions.length)throw new RecordServiceError(403,"ENTITY_APPLICATION_FORBIDDEN","No entity application sections are accessible"); }
      else await authorizeRecordListRead(options.authorizer,context,descriptor,collectionScope.status==="ready"?collectionScope.authorizationResource:undefined);
      const title=experience?resolveEntityText(experience.header.title):descriptor.listPresentation?.title??humanize(entityCode);
      return Object.freeze({schemaVersion:1 as const,plane:descriptor.planeKey,entity:Object.freeze({code:entityCode,label:title,pluralLabel:title}),revision:surfaceRevision(descriptor,experience??{title}),surface:Object.freeze({key:"entity_application",title,...(experience?{header:experience.header}:{}),...(descriptor.listPresentation?.description?{description:descriptor.listPresentation.description}:{})}),actions,navigation,...(experience?.application?{application:experience.application}:{}),scope:Object.freeze({status:collectionScope.status,labels:collectionScope.labels,fingerprint:scopeFingerprint(context,descriptor,undefined,collectionScope)})});
    },
    async descriptor(context: VerifiedRequestContext, entityCode: string, scopeCoordinate?: ListRecordsQuery["scopeCoordinate"], filterChoiceField?: string) {
      const descriptor = await descriptorFor(options.metadata, context, entityCode);
      const collectionScope = await resolveCollectionScope(options.collectionScopes, context, descriptor, scopeCoordinate);
      if (collectionScope.status === "forbidden") throw new RecordServiceError(403, collectionScope.code, collectionScope.message);
      const authorization = await authorizeRecordListRead(options.authorizer, context, descriptor, collectionScope.status === "ready" ? collectionScope.authorizationResource : undefined);
      const readable = await readableRecordFields(options.authorizer, context, descriptor);
      const dataOperations = await effectiveDataOperations(options.authorizer, context, descriptor, readable, authorization.scope, collectionScope);
      const actions = await effectiveListActions(options.authorizer, context, descriptor, collectionScope);
      const navigation = await effectiveEntityNavigation(options.authorizer, context, descriptor, collectionScope, options.attentionCounts);
      const choices = filterChoiceField ? await options.filterChoices?.(context, readable.filter(field => field.filterable && field.key === filterChoiceField)) ?? {} : {};
      const filterFields = readable.map(field => choices[field.key] ? { ...field, validation: { ...field.validation, options: choices[field.key] } } : field);
      return { ...compileEntityListDescriptor(context, descriptor, filterFields, authorization.scope, collectionScope, dataOperations, actions, navigation), standardViews: await availableStandardViews(context, {...descriptor,fields:readable}, standardViewSources) };
    },
    async formDescriptor(context: VerifiedRequestContext, entityCode: string, mode: "create" | "edit") {
      const descriptor = await descriptorFor(options.metadata, context, entityCode);
      const operation = mode === "create" ? "create" : "patch";
      await requireOperation(options.authorizer, context, descriptor, operation);
      if(mode === "edit") await requireOperation(options.authorizer, context, descriptor, "read");
      const readable = new Set((await readableRecordFields(options.authorizer, context, descriptor)).map((field) => field.key));
      const fields = await Promise.all(descriptor.fields.map(async (field) => {
        const writable = field.writableOn.includes(operation) && (!field.writePermissionCode || (await options.authorizer.authorize({ context, permissionCode: field.writePermissionCode, resource: { tenantId: context.tenantId, entityCode, operationKey: operation, field: field.key } })).allowed);
        if (!readable.has(field.key) && !writable) return undefined;
        return surfaceField(field, !writable);
      }));
      const visible = fields.filter((field): field is EntitySurfaceFieldV1 => Boolean(field));
      if (!visible.some((field) => !field.readOnly)) throw new RecordServiceError(403, "ENTITY_FORM_FIELDS_FORBIDDEN", "No fields are writable for this entity form");
      const label = humanize(entityCode), projection = { entityCode, mode, fields: visible, operation };
      return Object.freeze({ schema: "athyper.entity-form-descriptor/1", plane: descriptor.planeKey, entity: Object.freeze({ code: entityCode, label, pluralLabel: pluralize(label) }), revision: surfaceRevision(descriptor, projection), mode, title: mode === "create" ? `New ${label}` : `Edit ${label}`, description: `${mode === "create" ? "Create" : "Update"} a governed ${label.toLocaleLowerCase()} record.`, fields: Object.freeze(visible), submit: Object.freeze({ operation, label: mode === "create" ? `Create ${label}` : `Save ${label}` }) });
    },
    async detailDescriptor(context: VerifiedRequestContext, entityCode: string, recordId?: string) {
      const descriptor = await descriptorFor(options.metadata, context, entityCode);
      await requireOperation(options.authorizer, context, descriptor, "read", recordId);
      if (recordId) {
        if (!options.queries) throw new RecordServiceError(503, "ENTITY_RECORD_ADAPTER_UNAVAILABLE", "The record adapter is unavailable");
        const record = await options.queries.get({ context, entityCode, recordId });
        if (!record.data) throw new RecordServiceError(404, "ENTITY_RECORD_NOT_FOUND", "The governed record was not found");
      }
      const readable = await readableRecordFields(options.authorizer, context, descriptor);
      if (!readable.length) throw new RecordServiceError(403, "ENTITY_DETAIL_FIELDS_FORBIDDEN", "No fields are readable for this entity detail");
      const actions: { code: string; label: string; kind: "edit" | "transition" }[] = [];
      if (descriptor.operations["patch"] && await operationAllowed(options.authorizer, context, descriptor, "patch", recordId)) actions.push({ code: "edit", label: "Edit", kind: "edit" });
      for (const transition of descriptor.lifecycle?.transitions ?? []) if ((await options.authorizer.authorize({ context, permissionCode: transition.permissionCode, resource: { tenantId: context.tenantId, entityCode, operationKey: "transition", transitionCode: transition.code } })).allowed) actions.push({ code: transition.code, label: humanize(transition.code), kind: "transition" });
      const fields = readable.map((field) => surfaceField(field, true));
      const identity = descriptor.listPresentation?.identityField;
      const titleField = identity && readable.some((field) => field.key === identity) ? identity : readable.find((field) => field.storagePath === descriptor.storage.idField)?.key ?? readable[0]!.key;
      const presentation = readableRecordPresentation(descriptor.recordPresentation ?? parseEntityRecordPresentation({ schemaVersion: 1, titleField, iconKey: descriptor.listPresentation?.experience?.header.iconKey, sections: [{ key: "overview", label: "Overview", fields: fields.map(field => field.key) }], actions: [{ key: "edit", label: "Edit", operationKey: "patch", placement: "primary" }] }), fields.map(field => field.key), actions.map(action => action.kind === "edit" ? "patch" : action.code), titleField);
      return Object.freeze({ schema: "athyper.entity-detail-descriptor/1", presentation, plane: descriptor.planeKey, entity: Object.freeze({ code: entityCode, label: humanize(entityCode), pluralLabel: pluralize(humanize(entityCode)) }), revision: surfaceRevision(descriptor, { entityCode, fields, actions, titleField, presentation }), titleField, fields: Object.freeze(fields), actions: Object.freeze(actions) });
    },
    async record(context:VerifiedRequestContext,entityCode:string,recordId:string){
      if(!options.queries)throw new RecordServiceError(503,"ENTITY_RECORD_ADAPTER_UNAVAILABLE","The normalized entity record adapter is unavailable");
      const descriptor=await descriptorFor(options.metadata,context,entityCode),result=await options.queries.get({context,entityCode,recordId}),data=result.data;
      if(!data)throw new RecordServiceError(404,"ENTITY_RECORD_NOT_FOUND","The governed record was not found");
      const rawId=data[descriptor.storage.idField];
      if(typeof rawId!=="string"&&typeof rawId!=="number")throw new RecordServiceError(500,"RECORD_IDENTITY_INVALID","The record has no serializable identity");
      const values=Object.fromEntries(descriptor.fields.flatMap((field)=>Object.hasOwn(data,field.key)?[[field.key,data[field.key]]]:[]));
      const rawVersion=descriptor.storage.versionField?data[descriptor.storage.versionField]:undefined,version=typeof rawVersion==="number"&&Number.isInteger(rawVersion)&&rawVersion>=0?rawVersion:undefined;
      return Object.freeze({id:String(rawId),...(version===undefined?{}:{version}),values:Object.freeze(values)});
    },
    async list(query: ListRecordsQuery) {
      if ((query.sort?.length ?? 0) > 10) throw new RecordServiceError(400, "TOO_MANY_SORT_FIELDS", "Entity lists support at most ten sort fields");
      const resolvedQuery = query.standardViewKey ? await resolveStandardView(query, await descriptorFor(options.metadata,query.context,query.entityCode),standardViewSources) : query;
      const execution = await options.listExecutor.execute(resolvedQuery);
      const { descriptor, collectionScope, authorization, readableFields: readable, responseFields, result } = execution;
      const dataOperations = await effectiveDataOperations(options.authorizer, query.context, descriptor, readable, authorization.scope, collectionScope);
      const safeDescriptor = compileEntityListDescriptor(query.context, descriptor, readable, authorization.scope, collectionScope, dataOperations);
      const identity = storageIdentityProjection(descriptor, readable);
      const rows = result.data.map((source, index) => {
        const rawId = source[descriptor.storage.idField];
        if (typeof rawId !== "string" && typeof rawId !== "number") throw new RecordServiceError(500, "RECORD_IDENTITY_INVALID", `Record ${index} has no serializable identity`);
        const values: Record<string, JsonValue> = {};
        for (const field of responseFields) {
          const value = jsonValue(source[field.key]);
          if (value !== undefined) values[field.key] = value;
        }
        if (!identity.published) values[identity.key] = String(rawId);
        const versionField = descriptor.storage.versionField;
        const version = versionField && Number.isInteger(source[versionField]) && Number(source[versionField]) >= 0 ? Number(source[versionField]) : undefined;
        return Object.freeze({ id: String(rawId), ...(version !== undefined ? { version } : {}), values: Object.freeze(values) });
      });
      return Object.freeze({
        schemaVersion: 1,
        descriptorHash: safeDescriptor.revision.descriptorHash,
        scopeFingerprint: safeDescriptor.scope.fingerprint,
        queryHash: digest({ entityCode: query.entityCode, scopeFingerprint: safeDescriptor.scope.fingerprint, limit: query.limit ?? safeDescriptor.limits.defaultPageSize, cursor: query.cursor ?? null, fields: query.fields ?? [], filters: query.filters ?? [], sort: query.sort ?? [], group: query.group ?? null, search: query.search ?? null, countMode: query.countMode ?? "none" }),
        rows: Object.freeze(rows),
        pagination: Object.freeze({ pageSize: result.pagination.pageSize, hasNext: result.pagination.hasMore, ...(result.pagination.nextCursor ? { nextCursor: result.pagination.nextCursor } : {}), hasPrevious: false, ...(result.pagination.total !== undefined ? { total: result.pagination.total } : {}), countMode: result.pagination.countMode, ...((query.countMode ?? "none") !== result.pagination.countMode ? { requestedCountMode: query.countMode ?? "none" } : {}) }),
        ...(result.groups ? { groups: Object.freeze(result.groups.map((group) => Object.freeze({ value: jsonValue(group.value) ?? null, label: formatGroupLabel(group.value), count: group.count }))) } : {}),
      });
    },
  });
}

async function requireOperation(authorizer: Authorizer, context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, operation: string, recordId?: string): Promise<void> { if (!(await operationAllowed(authorizer, context, descriptor, operation, recordId))) throw new RecordServiceError(descriptor.operations[operation] ? 403 : 409, descriptor.operations[operation] ? "FORBIDDEN" : "ENTITY_OPERATION_UNAVAILABLE", `Entity ${operation} operation is not available`); }
async function operationAllowed(authorizer: Authorizer, context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, operation: string, recordId?: string): Promise<boolean> { const published = descriptor.operations[operation], permissionCode = published?.permissionCode; if (!permissionCode) return false; return (await authorizer.authorize({ context, permissionCode, resource: published.authorizationMode === "permission_only" ? { tenantId: context.tenantId } : { tenantId: context.tenantId, entityCode: descriptor.entityCode, operationKey: operation, resourceCode: descriptor.entityCode, ...(recordId ? { recordId } : {}) } })).allowed; }
function surfaceField(field: EntityFieldDescriptor, readOnly: boolean): EntitySurfaceFieldV1 { const raw = Array.isArray(field.validation?.["options"]) ? field.validation["options"] : []; const options = raw.flatMap((candidate) => typeof candidate === "string" ? [{ value: candidate, label: humanize(candidate) }] : candidate && typeof candidate === "object" && !Array.isArray(candidate) && typeof Reflect.get(candidate, "value") === "string" ? [{ value: String(Reflect.get(candidate, "value")), label: typeof Reflect.get(candidate, "label") === "string" ? String(Reflect.get(candidate, "label")) : humanize(String(Reflect.get(candidate, "value"))) }] : []); return Object.freeze({ key: field.key, label: field.list?.label ?? humanize(field.key), kind: field.type, required: field.required, readOnly, ...(options.length ? { options: Object.freeze(options) } : {}) }); }
function surfaceRevision(descriptor: EntityRuntimeDescriptor, projection: unknown) { return Object.freeze({ release: descriptor.releaseNo, descriptorHash: normalizeDigest(descriptor.compiledHash), surfaceHash: digest(projection) }); }

export function compileEntityListDescriptor(context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, readableFields: readonly EntityFieldDescriptor[], scope?: EffectiveAuthorizationScope, collectionScope?: RecordCollectionScopeResolution, dataOperations?: EntityListDataOperationsV1, actions: readonly EffectiveListActionV1[] = [], navigation: readonly EffectiveEntitySectionV1[] = []): EntityListDescriptorV1 {
  if (!readableFields.length) throw new RecordServiceError(403, "ENTITY_LIST_FIELDS_FORBIDDEN", "No fields are readable for this entity list");
  const storageIdentity = storageIdentityProjection(descriptor, readableFields);
  const configuredIdentity = descriptor.listPresentation?.identityField;
  const identityKey = configuredIdentity && readableFields.some((field) => field.key === configuredIdentity) ? configuredIdentity : storageIdentity.key;
  const configuredColumnList = descriptor.listPresentation?.defaultState?.columns ?? descriptor.listPresentation?.defaultColumns ?? [];
  const configuredColumns = new Set(configuredColumnList);
  const hasConfiguredColumns = configuredColumns.size > 0;
  const fields: ListFieldDescriptorV1[] = readableFields.map((field, index) => {
    const options = filterOptions(field);
    return Object.freeze({
      key: field.key,
      label: field.list?.label ?? humanize(field.key),
      ...(field.list?.columnGroup ? { columnGroup: field.list.columnGroup } : {}),
      valueKind: field.list?.semanticRole === "country_code" ? "reference" : field.type,
      ...(field.list?.semanticRole ? { semanticRole: field.list.semanticRole } : {}),
      ...(field.list?.rendererKey ? { rendererKey: field.list.rendererKey } : {}),
      ...(options.length ? { filterOptions: options } : {}),
      defaultVisible: field.key === identityKey || (hasConfiguredColumns ? configuredColumns.has(field.key) : field.list?.defaultVisible ?? (index < 8 && !["confidential", "pii", "sensitive_pii"].includes(field.classification ?? "internal"))),
      defaultOrder: hasConfiguredColumns && configuredColumns.has(field.key) ? configuredColumnList.indexOf(field.key) : field.list?.defaultOrder ?? index,
      ...(field.list?.defaultWidth ? { defaultWidth: field.list.defaultWidth } : {}),
      filterOperators: field.filterable ? configuredFilterOperators(field) : Object.freeze([]),
      sortable: field.sortable === true,
      groupable: field.list?.groupable === true,
      aggregations: Object.freeze(field.list?.aggregations ?? []),
    });
  });
  if (!storageIdentity.published && identityKey === storageIdentity.key) fields.unshift(Object.freeze({ key: storageIdentity.key, label: "Record ID", valueKind: "string", defaultVisible: true, defaultOrder: 0, filterOperators: Object.freeze([]), sortable: false, groupable: false, aggregations: Object.freeze([]) }));
  const ordered = Object.freeze([...fields].sort((left, right) => Number(right.key === identityKey) - Number(left.key === identityKey) || left.defaultOrder - right.defaultOrder || left.key.localeCompare(right.key)).map((field, index) => Object.freeze({ ...field, defaultOrder: index })));
  const columns = Object.freeze(ordered.filter((field) => field.defaultVisible).map((field) => field.key));
  const label = humanize(descriptor.entityCode);
  const contextRequired = collectionScope?.status === "context_required" || Boolean(descriptor.directoryScope?.mode !== "tenant" && scope && !scope.tenantWide && (collectionScope?.status !== "ready" || !collectionScope.constraints.length));
  const scopeLabels = collectionScope?.labels.length ? collectionScope.labels : [{ key: "access", label: "Scope", value: contextRequired ? "Work context required" : "All permitted tenant records" }];
  const modes = normalizeModes(descriptor.listPresentation?.supportedModes);
  const configuredLimits = descriptor.listPresentation?.limits;
  const pageSizes = normalizePageSizes(configuredLimits?.allowedPageSizes ?? descriptor.listPresentation?.allowedPageSizes);
  const requestedPageSize = configuredLimits?.defaultPageSize ?? descriptor.listPresentation?.defaultPageSize;
  const defaultPageSize = pageSizes.includes(requestedPageSize ?? -1) ? requestedPageSize! : pageSizes[0]!;
  const maxSortLevels = configuredLimits?.maxSortLevels ?? ENTITY_LIST_MAX_SORT_LEVELS;
  const configuredState = descriptor.listPresentation?.defaultState;
  const defaultSort = normalizeDefaultSort(configuredState?.sort ?? descriptor.listPresentation?.defaultSort, ordered, maxSortLevels);
  const defaultFilters = normalizeDefaultFilters(configuredState?.filters, ordered);
  const defaultGroup = configuredState?.group && ordered.some((field) => field.key === configuredState.group && field.groupable) ? configuredState.group : undefined;
  const defaultMode = configuredState?.mode && modes.includes(configuredState.mode) ? configuredState.mode : modes[0]!;
  const minimumQueryLength = descriptor.listPresentation?.search?.minimumQueryLength ?? 1;
  const filterPresentation = resolveFilterPresentation(descriptor, ordered);
  const surfaceProjection = { entityCode: descriptor.entityCode, fields: ordered, modes, pageSizes, maxSortLevels, defaultSort, defaultFilters, defaultGroup, defaultMode, minimumQueryLength, filterPresentation, experience: descriptor.listPresentation?.experience };
  return Object.freeze({
    schemaVersion: 1,
    serverViews: true,
    plane: descriptor.planeKey,
    entity: Object.freeze({ code: descriptor.entityCode, label, pluralLabel: pluralize(label), identityField: identityKey, ...(descriptor.detailRouteTemplate ? { detailRouteTemplate: descriptor.detailRouteTemplate } : {}) }),
    revision: Object.freeze({ release: descriptor.releaseNo, descriptorHash: normalizeDigest(descriptor.compiledHash), surfaceHash: digest(surfaceProjection) }),
    surface: Object.freeze({ key: "default_list", title: descriptor.listPresentation?.experience ? resolveEntityText(descriptor.listPresentation.experience.header.title) : descriptor.listPresentation?.title ?? descriptor.entityCode, ...(descriptor.listPresentation?.experience ? { header: descriptor.listPresentation.experience.header } : {}), ...(descriptor.listPresentation?.description ? { description: descriptor.listPresentation.description } : {}), defaultState: Object.freeze({ ...(configuredState?.query ? { query: configuredState.query } : {}), filters: defaultFilters, sort: defaultSort, ...(defaultGroup ? { group: defaultGroup } : {}), columns, density: configuredState?.density ?? descriptor.listPresentation?.defaultDensity ?? "comfortable", mode: defaultMode }), supportedModes: modes, search: Object.freeze({ ...(descriptor.listPresentation?.search?.profileKey ? { profileKey: descriptor.listPresentation.search.profileKey } : {}), minimumQueryLength }), filterPresentation }),
    fields: ordered,
    actions,
    navigation,
    ...(descriptor.listPresentation?.experience?.application ? {application:descriptor.listPresentation.experience.application} : {}),
    ...(descriptor.listPresentation?.experience?.currentSurfaceKey ? { currentSurfaceKey: descriptor.listPresentation.experience.currentSurfaceKey } : {}),
    ...(dataOperations ? { dataOperations } : {}),
    scope: Object.freeze({ ...(descriptor.directoryScope?.quickFilters ? { quickFilters: descriptor.directoryScope.quickFilters } : {}), ...(descriptor.directoryScope?.filters ? { filterKinds: descriptor.directoryScope.filters } : {}), status: contextRequired ? "context_required" : "ready", labels: Object.freeze(scopeLabels), fingerprint: scopeFingerprint(context, descriptor, scope, collectionScope) }),
    limits: Object.freeze({ defaultPageSize, allowedPageSizes: pageSizes, maxSortLevels, countMode: configuredLimits?.countMode ?? descriptor.listPresentation?.countMode ?? "none" }),
  });
}

async function effectiveDataOperations(authorizer: Authorizer, context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, readable: readonly EntityFieldDescriptor[], scope?: EffectiveAuthorizationScope, collectionScope?: RecordCollectionScopeResolution): Promise<EntityListDataOperationsV1> {
  const resource = collectionScope?.status === "ready" ? collectionScope.authorizationResource : { entityCode: descriptor.entityCode };
  const allowed = async (operation: "import" | "export") => {
    const permission = descriptor.operations[operation]?.permissionCode;
    return permission ? { permission, allowed: (await authorizer.authorize({ context, permissionCode: permission, resource, observation: { entityCode: descriptor.entityCode, operationKey: operation, surface: "transfer", phase: "discover" } })).allowed } : undefined;
  };
  const [exportAuthority, importAuthority] = await Promise.all([allowed("export"), allowed("import")]);
  const enabled = (permission?: string, maxRecords?: number, requiresPreflight = false, requiresApproval = false) => Object.freeze({ state: "enabled" as const, ...(maxRecords ? { maxRecords } : {}), ...(permission ? { requiredPermission: permission } : {}), requiresPreflight, requiresApproval });
  const disabled = (permission:string|undefined,code:string,message:string,requiresApproval=false) => Object.freeze({ state:"disabled" as const,...(permission?{requiredPermission:permission}:{}),requiresPreflight:true,requiresApproval,disabledReason:Object.freeze({code,message}) });
  const hidden = Object.freeze({ state: "hidden" as const, requiresPreflight: false, requiresApproval: false });
  const config = descriptor.listPresentation?.dataOperations;
  const exportMax = config?.exportMaxRecords ?? 250_000, importMax = config?.importMaxRows ?? 50_000;
  const serverExport = exportAuthority?.allowed ? enabled(exportAuthority.permission, exportMax, true) : hidden;
  const adapterReady=Boolean(config?.importAdapterKey);
  const serverImport = !importAuthority?.allowed ? hidden : !adapterReady ? disabled(importAuthority.permission,"GOVERNED_IMPORT_ADAPTER_REQUIRED","A tested plane-owned import adapter has not been published for this entity.",true) : enabled(importAuthority.permission, importMax, true);
  const createFields=readable.filter(field=>field.writableOn.includes("create")).map(field=>field.key),patchFields=readable.filter(field=>field.writableOn.includes("patch")).map(field=>field.key),importable=[...new Set([...createFields,...patchFields])];
  const importModes=new Set(config?.importOperations??["create","update","upsert"]);
  const modeAllowed=async(mode:"create"|"update"|"upsert"|"delete"|"replace")=>{const permissions=config?.importOperationPermissions?.[mode]??[];if(!permissions.length)return false;const decisions=await Promise.all(permissions.map(permissionCode=>authorizer.authorize({context,permissionCode,resource})));return decisions.every(decision=>decision.allowed);};
  const [createAllowed,updateAllowed,upsertAllowed,deleteAllowed,replaceAllowed]=await Promise.all([modeAllowed("create"),modeAllowed("update"),modeAllowed("upsert"),modeAllowed("delete"),modeAllowed("replace")]);
  const exportFormats = Object.freeze(config?.exportFormats?.length ? [...new Set(config.exportFormats)] : ["xlsx", "csv", "json", "ndjson"] as const);
  const importFormats = Object.freeze(config?.importFormats?.length ? [...new Set(config.importFormats)] : ["csv", "json"] as const);
  return Object.freeze({
    export: Object.freeze({
      currentPage: serverExport, selected: serverExport, filtered: serverExport,
      all: exportAuthority?.allowed && config?.allowEntireEntityExport === true && scope?.tenantWide ? serverExport : hidden,
      formats: exportFormats, defaultFormat: exportFormats[0]!, exportableFields: Object.freeze(readable.map((field) => field.key)),
      asynchronousThreshold: config?.asynchronousThreshold ?? 5_000,
    }),
    import: Object.freeze({
      create: importAuthority?.allowed && importModes.has("create")&&createAllowed&&createFields.length ? serverImport : hidden,
      update: importAuthority?.allowed && importModes.has("update")&&updateAllowed&&patchFields.length ? serverImport : hidden,
      upsert: importAuthority?.allowed && importModes.has("upsert")&&upsertAllowed&&createFields.length && patchFields.length ? serverImport : hidden,
      delete:importAuthority?.allowed&&importModes.has("delete")&&deleteAllowed?serverImport:hidden,
      replace:importAuthority?.allowed&&importModes.has("replace")&&replaceAllowed&&createFields.length&&patchFields.length?serverImport:hidden,
      downloadTemplate: importAuthority?.allowed && config?.allowTemplateDownload !== false && importable.length ? enabled(importAuthority.permission) : hidden,
      formats: importFormats, defaultFormat: importFormats[0]!, importableFields: Object.freeze(importable),
      maxFileBytes: config?.importMaxFileBytes ?? 25 * 1024 * 1024, maxRows: importMax,
      draftOnly: config?.draftOnly ?? descriptor.planeKey === "studio",
    }),
  });
}

function filterOptions(field: EntityFieldDescriptor): readonly Readonly<{ value: string | number | boolean; label: string }>[] {
  const configured = field.validation?.["options"];
  if (!Array.isArray(configured) || configured.length > 500) return Object.freeze([]);
  const options = configured.flatMap((candidate) => {
    if (["string", "number", "boolean"].includes(typeof candidate)) return [{ value: candidate as string | number | boolean, label: humanize(String(candidate)) }];
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return [];
    const value = Reflect.get(candidate, "value"), label = Reflect.get(candidate, "label");
    return ["string", "number", "boolean"].includes(typeof value) && typeof label === "string" && label.trim() ? [{ value: value as string | number | boolean, label: label.trim() }] : [];
  });
  return Object.freeze(options);
}

function storageIdentityProjection(descriptor: EntityRuntimeDescriptor, fields: readonly EntityFieldDescriptor[]): { readonly key: string; readonly published: boolean } {
  const field = fields.find((candidate) => candidate.storagePath === descriptor.storage.idField);
  return field ? { key: field.key, published: true } : { key: "record_id", published: false };
}

function normalizeModes(value: readonly ListViewMode[] | undefined): readonly ListViewMode[] { const allowed = new Set<ListViewMode>(["table", "compact"]); const modes = [...new Set((value ?? ["table", "compact"]).filter((mode) => allowed.has(mode)))]; return Object.freeze(modes.length ? modes : ["table"]); }
function normalizePageSizes(value: readonly number[] | undefined): readonly number[] { const sizes = [...new Set((value ?? [25, 50, 100]).filter((size) => Number.isInteger(size) && size >= 1 && size <= 100))].sort((left, right) => left - right); return Object.freeze(sizes.length ? sizes : [50]); }
function normalizeDefaultSort(value: readonly ListSortV1[] | undefined, fields: readonly ListFieldDescriptorV1[], maxSortLevels: number): readonly ListSortV1[] {
  const sortable = new Set(fields.filter((field) => field.sortable).map((field) => field.key));
  const seen = new Set<string>();
  const normalized: ListSortV1[] = [];
  for (const sort of value ?? []) {
    if (normalized.length === maxSortLevels) break;
    if (!sortable.has(sort.field) || seen.has(sort.field)) continue;
    seen.add(sort.field);
    normalized.push(Object.freeze({ field: sort.field, direction: sort.direction, ...(sort.nulls ? { nulls: sort.nulls } : {}) }));
  }
  return Object.freeze(normalized);
}

function configuredFilterOperators(field: EntityFieldDescriptor): ListFieldDescriptorV1["filterOperators"] {
  const operators = recordFieldFilterOperators(field);
  return field.list?.semanticRole === "country_code" ? operators.filter(operator => ["eq", "ne", "in", "is_null", "is_not_null"].includes(operator)) : operators;
}

function resolveFilterPresentation(descriptor: EntityRuntimeDescriptor, fields: readonly ListFieldDescriptorV1[]): EntityListDescriptorV1["surface"]["filterPresentation"] {
  const byKey = new Map(fields.map((field) => [field.key, field])), configured = descriptor.listPresentation?.filterPresentation?.quickFields ?? [];
  const metadata = configured.flatMap((item) => {
    const field = byKey.get(item.field);
    if (!field?.filterOperators.length) return [];
    const defaultOperator = item.defaultOperator && field.filterOperators.includes(item.defaultOperator as ListFilterOperator) ? item.defaultOperator as ListFilterOperator : preferredFilterOperator(field);
    return [Object.freeze({ field: field.key, defaultOperator })];
  }).slice(0, 4);
  const quickFields = metadata.length ? metadata : fields.filter((field) => field.filterOperators.length).sort((left, right) => quickFilterPriority(left) - quickFilterPriority(right)).slice(0, 4).map((field) => Object.freeze({ field: field.key, defaultOperator: preferredFilterOperator(field) }));
  return Object.freeze({ quickFields: Object.freeze(quickFields), source: metadata.length ? "metadata" : "fallback", allowUserPinning: descriptor.listPresentation?.filterPresentation?.allowUserPinning === true });
}

function quickFilterPriority(field: ListFieldDescriptorV1): number { const value = `${field.key} ${field.label}`; return field.semanticRole === "status" || /\bstatus\b/i.test(value) ? 0 : /category|group|class|kind/i.test(value) ? 1 : field.semanticRole === "country_code" || /country/i.test(value) ? 2 : field.semanticRole === "updated_at" || /updated|modified/i.test(value) ? 3 : 10 + field.defaultOrder; }
function preferredFilterOperator(field: ListFieldDescriptorV1): ListFilterOperator { const preferred = field.valueKind === "date" || field.valueKind === "datetime" ? "relative" : field.filterOptions?.length || field.valueKind === "enum" || field.valueKind === "boolean" || field.valueKind === "reference" ? "eq" : "contains"; return field.filterOperators.includes(preferred) ? preferred : field.filterOperators[0]!; }

function normalizeDefaultFilters(value: EntityListDefaultStateDescriptor["filters"], fields: readonly ListFieldDescriptorV1[]): readonly ListFilterV1[] {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const filters: ListFilterV1[] = [];
  for (const filter of value ?? []) {
    const field = byKey.get(filter.field);
    if (!field?.filterOperators.includes(filter.operator)) continue;
    const normalized = filter.value === undefined ? undefined : jsonValue(filter.value);
    if (filter.value !== undefined && normalized === undefined) continue;
    filters.push(Object.freeze({ field: filter.field, operator: filter.operator, ...(normalized !== undefined ? { value: normalized } : {}) }));
  }
  return Object.freeze(filters);
}

function formatGroupLabel(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function jsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "bigint") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => jsonValue(item) ?? null);
  if (typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => { const normalized = jsonValue(item); return normalized === undefined ? [] : [[key, normalized]]; })));
  return String(value);
}

function humanize(value: string): string { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (character) => character.toUpperCase()); }
function pluralize(value: string): string { return /[^aeiou]y$/i.test(value) ? `${value.slice(0, -1)}ies` : /s$/i.test(value) ? value : `${value}s`; }
function normalizeDigest(value: string): string { return /^(?:sha256:)?[a-f0-9]{64}$/.test(value) ? value : digest(value); }
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function scopeFingerprint(context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, scope?: EffectiveAuthorizationScope, collectionScope?: RecordCollectionScopeResolution): string { return digest({ planeKey: context.planeKey, tenantId: context.tenantId, principalFingerprint: context.permissions.principalFingerprint, authEpoch: context.authEpoch, profileHash: context.profileHash, schemaHash: context.permissions.schemaHash, descriptorHash: descriptor.compiledHash, scope: scope ?? null, collectionScope: collectionScope?.status === "ready" ? collectionScope.fingerprintMaterial : collectionScope?.status ?? null }); }

async function resolveCollectionScope(resolver: RecordCollectionScopeResolver | undefined, context: VerifiedRequestContext, descriptor: EntityRuntimeDescriptor, coordinate?: ListRecordsQuery["scopeCoordinate"]): Promise<RecordCollectionScopeResolution> {
  if (resolver) return resolver.resolve({ context, descriptor, operationCode: "read", ...(coordinate ? { coordinate } : {}) });
  return Object.freeze({ status: "ready", authorizationResource: Object.freeze({}), constraints: Object.freeze([]), labels: Object.freeze([]), fingerprintMaterial: Object.freeze({ mode: "tenant" }) });
}
