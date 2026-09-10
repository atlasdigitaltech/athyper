import { parseEntityAuthorizationRuntime } from "@athyper/server-contract-metadata";
import { parseEntityAiDescriptor } from "@athyper/server-contract-metadata";
import { parseEntityAuthorizationProfile } from "@athyper/server-contract-metadata";
import { parseEntityDirectoryScope } from "@athyper/server-contract-metadata";
import { parseEntityRecordPresentation, validateRecordPresentationReferences, validateRelatedPresentationOwner } from "@athyper/contract-platform-entity-runtime";
import { parseCollectionRelationship } from "@athyper/server-contract-metadata";
import { parsePublishedListExperience } from "@athyper/contract-platform-entity-list";
import { entityFieldFilterOperators, type EntityFieldDescriptor, type EntityListFilterOperator, type EntityListPresentationDescriptor, type EntityPolicyBindingDescriptor, type EntityRuntimeDescriptor } from "@athyper/server-contract-metadata";
import { normalizePlaneKey, type PlaneKeyInput } from "@athyper/server-foundation/context";

export interface RuntimeDescriptorRow {
  readonly entity_code: string;
  readonly release_id: string;
  readonly release_no: string | number | bigint;
  readonly entity_contract_hash: string;
  readonly plane_code: string;
  readonly compiled_hash: string;
  readonly compiled_json: unknown;
}

export function parseEntityRuntimeDescriptor(row: RuntimeDescriptorRow): EntityRuntimeDescriptor {
  const value = object(row.compiled_json, "compiled_json");
  if (value["schema"] !== "athyper.entity-runtime-descriptor/1.0") throw new Error("Unsupported entity descriptor schema");
  if (row.plane_code !== "studio" && row.plane_code !== "neon" && row.plane_code !== "mesh" && row.plane_code !== "athyper") throw new Error("Invalid entity descriptor plane");
  const planeKey = normalizePlaneKey(row.plane_code as PlaneKeyInput);
  if (value["entityCode"] !== row.entity_code || normalizePlaneKey(String(value["planeKey"]) as PlaneKeyInput) !== planeKey) throw new Error("Entity descriptor coordinate mismatch");
  const storage = object(value["storage"], "storage");
  const fields = array(value["fields"], "fields").map(parseField);
  const listPresentation = value["listPresentation"] === undefined ? undefined : parseListPresentation(value["listPresentation"]);
  if (listPresentation) validateListPresentation(listPresentation, fields);
  const operationsValue = object(value["operations"], "operations");
  const operations = Object.fromEntries(Object.entries(operationsValue).map(([key, operation]) => {
    const item = object(operation, `operations.${key}`);
    return [key, { code: string(item["code"], `operations.${key}.code`), permissionCode: string(item["permissionCode"], `operations.${key}.permissionCode`), ...(item["authorizationMode"] === undefined ? {} : { authorizationMode: oneOf(item["authorizationMode"], ["bound_operation", "permission_only"] as const, "operation.authorizationMode") }) }];
  }));
  for (const action of [...(listPresentation?.experience?.actions ?? []), ...(listPresentation?.experience?.navigation ?? [])]) {
    const permission = action.permissions.find(item => item.plane === planeKey);
    if (permission && operations[action.operationKey]?.permissionCode !== permission.permissionCode) throw new TypeError("List action must reference a published operation with its exact plane permission");
  }
  const recordPresentation = value["recordPresentation"] === undefined ? undefined : parseEntityRecordPresentation(value["recordPresentation"]);
  const authorization = value["authorization"] === undefined ? undefined : parseEntityAuthorizationProfile(value["authorization"], {
    entityCode: row.entity_code, planeKey, fields: fields.map(field => field.key), operations,
  });
  const authorizationRuntime = value["authorizationRuntime"] === undefined ? undefined : (() => {
    if (!authorization) throw new TypeError("Authorization runtime requires profile");
    return parseEntityAuthorizationRuntime(value["authorizationRuntime"], authorization);
  })();
  if (recordPresentation) validateRecordPresentationReferences(recordPresentation, fields.map(field => field.key), Object.keys(operations));
  if (recordPresentation?.related) validateRelatedPresentationOwner(recordPresentation.related, row.entity_code);
  const collectionRelationship = value["collectionRelationship"] === undefined ? undefined : parseCollectionRelationship(value["collectionRelationship"], {schema:String(storage["schema"]),object:String(storage["object"]),idField:String(storage["idField"]),tenantField:storage["tenantField"] as string|undefined});
  const ai = value["ai"] === undefined ? undefined : parseEntityAiDescriptor(value["ai"], {
    entityCode: row.entity_code, planeKey,
    fields: fields.map(field => ({ key: field.key, searchable: field.searchable === true, reference: field.type === "reference" })),
    operationKeys: Object.keys(operations),
    ...(collectionRelationship ? { collectionSourceRef: collectionRelationship.sourceRef } : {}),
  });
  const lifecycleValue = value["lifecycle"] === undefined ? undefined : object(value["lifecycle"], "lifecycle");
  const releaseNo = Number(row.release_no);
  if (!Number.isSafeInteger(releaseNo) || releaseNo < 1) throw new Error("Invalid descriptor release number");
  return Object.freeze({
    schema: "athyper.entity-runtime-descriptor/1.0",
    entityCode: row.entity_code,
    ...(value["detailRouteTemplate"] === undefined ? {} : { detailRouteTemplate: routeTemplate(value["detailRouteTemplate"]) }),
    planeKey,
    releaseId: row.release_id,
    releaseNo,
    contractHash: hash(row.entity_contract_hash, "contract hash"),
    compiledHash: hash(row.compiled_hash, "compiled hash"),
    storage: {
      schema: identifier(storage["schema"], "storage.schema"), object: identifier(storage["object"], "storage.object"),
      idField: identifier(storage["idField"], "storage.idField"),
      ...(storage["tenantField"] ? { tenantField: identifier(storage["tenantField"], "storage.tenantField") } : {}),
      ...(storage["versionField"] ? { versionField: identifier(storage["versionField"], "storage.versionField") } : {}),
      ...(storage["softDeleteField"] ? { softDeleteField: identifier(storage["softDeleteField"], "storage.softDeleteField") } : {}),
      ...(storage["statusField"] ? { statusField: identifier(storage["statusField"], "storage.statusField") } : {}),
    },
    fields,
    ...(authorization ? { authorization } : {}),
    ...(authorizationRuntime ? { authorizationRuntime } : {}),
    ...(ai ? { ai } : {}),
    ...(recordPresentation ? { recordPresentation } : {}),
    ...(value["directoryScope"] === undefined ? {} : { directoryScope: parseEntityDirectoryScope(value["directoryScope"]) }),
    ...(collectionRelationship ? { collectionRelationship } : {}),
    operations,
    ...(lifecycleValue ? { lifecycle: { transitions: array(lifecycleValue["transitions"], "lifecycle.transitions").map((raw) => {
      const item = object(raw, "transition");
      return { code: string(item["code"], "transition.code"), from: array(item["from"], "transition.from").map((entry) => string(entry, "transition.from")), to: string(item["to"], "transition.to"), permissionCode: string(item["permissionCode"], "transition.permissionCode") };
    }) } } : {}),
    ...(value["policyBindings"] === undefined ? {} : { policyBindings: array(value["policyBindings"], "policyBindings").map(parsePolicyBinding) }),
    ...(listPresentation ? { listPresentation } : {}),
  });
}

function routeTemplate(value:unknown):string{const route=boundedString(value,"detailRouteTemplate",512);if(!route.startsWith("/")||route.includes("..")||!route.includes(":recordId"))throw new Error("detailRouteTemplate must be a safe route containing :recordId");return route;}

function parseListPresentation(raw: unknown): EntityListPresentationDescriptor {
  const item = object(raw, "listPresentation");
  const schemaVersion = item["schemaVersion"] === undefined ? undefined : boundedInteger(item["schemaVersion"], "listPresentation.schemaVersion", 1, 1) as 1;
  const density = item["defaultDensity"] === undefined ? undefined : oneOf(item["defaultDensity"], ["compact", "comfortable", "spacious"] as const, "listPresentation.defaultDensity");
  const modes = item["supportedModes"] === undefined ? undefined : array(item["supportedModes"], "listPresentation.supportedModes").map((value) => oneOf(value, ["table", "compact", "board", "dashboard", "spreadsheet"] as const, "listPresentation.supportedModes"));
  const defaultSort = item["defaultSort"] === undefined ? undefined : parseSort(item["defaultSort"], "listPresentation.defaultSort");
  const defaultStateItem = item["defaultState"] === undefined ? undefined : object(item["defaultState"], "listPresentation.defaultState");
  const defaultState = defaultStateItem ? {
    ...(defaultStateItem["query"] === undefined ? {} : { query: boundedString(defaultStateItem["query"], "listPresentation.defaultState.query", 512) }),
    ...(defaultStateItem["filters"] === undefined ? {} : { filters: array(defaultStateItem["filters"], "listPresentation.defaultState.filters").map((rawFilter, index) => {
      const filter = object(rawFilter, `listPresentation.defaultState.filters[${index}]`);
      return { field: identifier(filter["field"], `listPresentation.defaultState.filters[${index}].field`), operator: filterOperator(filter["operator"], `listPresentation.defaultState.filters[${index}].operator`), ...(Object.hasOwn(filter, "value") ? { value: jsonValue(filter["value"], `listPresentation.defaultState.filters[${index}].value`) } : {}) };
    }) }),
    ...(defaultStateItem["sort"] === undefined ? {} : { sort: parseSort(defaultStateItem["sort"], "listPresentation.defaultState.sort") }),
    ...(defaultStateItem["group"] === undefined ? {} : { group: identifier(defaultStateItem["group"], "listPresentation.defaultState.group") }),
    ...(defaultStateItem["columns"] === undefined ? {} : { columns: array(defaultStateItem["columns"], "listPresentation.defaultState.columns").map((value) => identifier(value, "listPresentation.defaultState.columns item")) }),
    ...(defaultStateItem["density"] === undefined ? {} : { density: oneOf(defaultStateItem["density"], ["compact", "comfortable", "spacious"] as const, "listPresentation.defaultState.density") }),
    ...(defaultStateItem["mode"] === undefined ? {} : { mode: oneOf(defaultStateItem["mode"], ["table", "compact", "board", "dashboard", "spreadsheet"] as const, "listPresentation.defaultState.mode") }),
  } : undefined;
  const searchItem = item["search"] === undefined ? undefined : object(item["search"], "listPresentation.search");
  const search = searchItem ? {
    ...(searchItem["profileKey"] === undefined ? {} : { profileKey: code(searchItem["profileKey"], "listPresentation.search.profileKey") }),
    ...(searchItem["minimumQueryLength"] === undefined ? {} : { minimumQueryLength: boundedInteger(searchItem["minimumQueryLength"], "listPresentation.search.minimumQueryLength", 1, 64) }),
  } : undefined;
  const filterPresentationItem = item["filterPresentation"] === undefined ? undefined : object(item["filterPresentation"], "listPresentation.filterPresentation");
  const filterPresentation = filterPresentationItem ? {
    ...(filterPresentationItem["quickFields"] === undefined ? {} : { quickFields: array(filterPresentationItem["quickFields"], "listPresentation.filterPresentation.quickFields").map((candidate, index) => {
      const quick = object(candidate, `listPresentation.filterPresentation.quickFields[${index}]`);
      return { field: identifier(quick["field"], `listPresentation.filterPresentation.quickFields[${index}].field`), ...(quick["defaultOperator"] === undefined ? {} : { defaultOperator: filterOperator(quick["defaultOperator"], `listPresentation.filterPresentation.quickFields[${index}].defaultOperator`) }) };
    }) }),
    ...(typeof filterPresentationItem["allowUserPinning"] === "boolean" ? { allowUserPinning: filterPresentationItem["allowUserPinning"] } : {}),
  } : undefined;
  const limitsItem = item["limits"] === undefined ? undefined : object(item["limits"], "listPresentation.limits");
  const limits = limitsItem ? {
    ...(limitsItem["defaultPageSize"] === undefined ? {} : { defaultPageSize: boundedInteger(limitsItem["defaultPageSize"], "listPresentation.limits.defaultPageSize", 1, 100) }),
    ...(limitsItem["allowedPageSizes"] === undefined ? {} : { allowedPageSizes: array(limitsItem["allowedPageSizes"], "listPresentation.limits.allowedPageSizes").map((value) => boundedInteger(value, "listPresentation.limits.allowedPageSizes item", 1, 100)) }),
    ...(limitsItem["maxSortLevels"] === undefined ? {} : { maxSortLevels: boundedInteger(limitsItem["maxSortLevels"], "listPresentation.limits.maxSortLevels", 0, 10) }),
    ...(limitsItem["countMode"] === undefined ? {} : { countMode: oneOf(limitsItem["countMode"], ["none", "cached", "approximate", "exact"] as const, "listPresentation.limits.countMode") }),
  } : undefined;
  const defaultPageSize = item["defaultPageSize"] === undefined ? undefined : boundedInteger(item["defaultPageSize"], "listPresentation.defaultPageSize", 1, 100);
  const allowedPageSizes = item["allowedPageSizes"] === undefined ? undefined : array(item["allowedPageSizes"], "listPresentation.allowedPageSizes").map((value) => boundedInteger(value, "listPresentation.allowedPageSizes item", 1, 100));
  const operations = item["dataOperations"] === undefined ? undefined : object(item["dataOperations"], "listPresentation.dataOperations");
  const dataOperations = operations ? {
    ...(operations["exportFormats"] === undefined ? {} : { exportFormats: array(operations["exportFormats"], "listPresentation.dataOperations.exportFormats").map((value) => oneOf(value, ["xlsx", "csv", "json", "ndjson"] as const, "listPresentation.dataOperations.exportFormats")) }),
    ...(operations["importFormats"] === undefined ? {} : { importFormats: array(operations["importFormats"], "listPresentation.dataOperations.importFormats").map((value) => oneOf(value, ["xlsx", "csv", "json"] as const, "listPresentation.dataOperations.importFormats")) }),
    ...(operations["exportMaxRecords"] === undefined ? {} : { exportMaxRecords: boundedInteger(operations["exportMaxRecords"], "listPresentation.dataOperations.exportMaxRecords", 1, 10_000_000) }),
    ...(operations["importMaxRows"] === undefined ? {} : { importMaxRows: boundedInteger(operations["importMaxRows"], "listPresentation.dataOperations.importMaxRows", 1, 10_000_000) }),
    ...(operations["importMaxFileBytes"] === undefined ? {} : { importMaxFileBytes: boundedInteger(operations["importMaxFileBytes"], "listPresentation.dataOperations.importMaxFileBytes", 1, 1_000_000_000) }),
    ...(operations["asynchronousThreshold"] === undefined ? {} : { asynchronousThreshold: boundedInteger(operations["asynchronousThreshold"], "listPresentation.dataOperations.asynchronousThreshold", 1, 10_000_000) }),
    ...(typeof operations["allowEntireEntityExport"] === "boolean" ? { allowEntireEntityExport: operations["allowEntireEntityExport"] } : {}),
    ...(typeof operations["allowTemplateDownload"] === "boolean" ? { allowTemplateDownload: operations["allowTemplateDownload"] } : {}),
    ...(typeof operations["draftOnly"] === "boolean" ? { draftOnly: operations["draftOnly"] } : {}),
    ...(operations["importAdapterKey"] === undefined ? {} : { importAdapterKey: code(operations["importAdapterKey"], "listPresentation.dataOperations.importAdapterKey") }),
    ...(operations["importOperations"] === undefined ? {} : { importOperations: array(operations["importOperations"], "listPresentation.dataOperations.importOperations").map(value => oneOf(value, ["create", "update", "upsert", "delete", "replace"] as const, "listPresentation.dataOperations.importOperations")) }),
    ...(operations["importOperationPermissions"] === undefined ? {} : { importOperationPermissions: importPermissionMap(operations["importOperationPermissions"]) }),
    ...(operations["importFields"] === undefined ? {} : { importFields: array(operations["importFields"], "listPresentation.dataOperations.importFields").map((value,index) => { const field=object(value,`listPresentation.dataOperations.importFields[${index}]`);return {key:identifier(field["key"],`listPresentation.dataOperations.importFields[${index}].key`),type:oneOf(field["type"],["string","text","integer","decimal","money","boolean","date","datetime","uuid","enum","reference","json"]as const,`listPresentation.dataOperations.importFields[${index}].type`),required:field["required"]===true,...(field["label"]===undefined?{}:{label:string(field["label"],`listPresentation.dataOperations.importFields[${index}].label`)})};}) }),
  } : undefined;
  return {
    ...(schemaVersion ? { schemaVersion } : {}),
    ...(item["experience"] === undefined ? {} : { experience: parsePublishedListExperience(item["experience"]) }),
    ...(item["title"] === undefined ? {} : { title: string(item["title"], "listPresentation.title") }),
    ...(item["description"] === undefined ? {} : { description: string(item["description"], "listPresentation.description") }),
    ...(item["identityField"] === undefined ? {} : { identityField: identifier(item["identityField"], "listPresentation.identityField") }),
    ...(item["defaultColumns"] === undefined ? {} : { defaultColumns: array(item["defaultColumns"], "listPresentation.defaultColumns").map((value) => identifier(value, "listPresentation.defaultColumns item")) }),
    ...(defaultState ? { defaultState } : {}), ...(search ? { search } : {}), ...(filterPresentation ? { filterPresentation } : {}), ...(limits ? { limits } : {}),
    ...(defaultSort ? { defaultSort } : {}), ...(density ? { defaultDensity: density } : {}), ...(modes ? { supportedModes: modes } : {}),
    ...(defaultPageSize !== undefined ? { defaultPageSize } : {}), ...(allowedPageSizes ? { allowedPageSizes } : {}),
    ...(item["countMode"] === undefined ? {} : { countMode: oneOf(item["countMode"], ["none", "cached", "approximate", "exact"] as const, "listPresentation.countMode") }),
    ...(dataOperations ? { dataOperations } : {}),
  };
}

function importPermissionMap(value:unknown){const item=object(value,"listPresentation.dataOperations.importOperationPermissions"),result:Partial<Record<"create"|"update"|"upsert"|"delete"|"replace",readonly string[]>>={};for(const mode of ["create","update","upsert","delete","replace"]as const)if(item[mode]!==undefined)result[mode]=array(item[mode],`listPresentation.dataOperations.importOperationPermissions.${mode}`).map(permission=>code(permission,`listPresentation.dataOperations.importOperationPermissions.${mode}`));return result;}

function parsePolicyBinding(raw: unknown): EntityPolicyBindingDescriptor {
  const item = object(raw, "policyBinding");
  const stage = string(item["stage"], "policyBinding.stage") as EntityPolicyBindingDescriptor["stage"];
  const enforcement = string(item["enforcement"], "policyBinding.enforcement") as EntityPolicyBindingDescriptor["enforcement"];
  if (!["authorization", "precondition", "validation", "postcondition", "masking"].includes(stage)) throw new Error(`Unsupported policy binding stage: ${stage}`);
  if (!["enforce", "warn", "observe"].includes(enforcement)) throw new Error(`Unsupported policy enforcement: ${enforcement}`);
  const policyVersionNo = Number(item["policyVersionNo"]);
  const priority = Number(item["priority"]);
  if (!Number.isSafeInteger(policyVersionNo) || policyVersionNo < 1) throw new Error("Invalid policy version");
  if (!Number.isSafeInteger(priority) || priority < 0 || priority > 32767) throw new Error("Invalid policy binding priority");
  return {
    key: code(item["key"], "policyBinding.key"), policyDefinitionId: uuid(item["policyDefinitionId"], "policyBinding.policyDefinitionId"),
    policyVersionNo, stage, enforcement, priority,
    ...(item["operationCode"] ? { operationCode: code(item["operationCode"], "policyBinding.operationCode") } : {}),
    ...(item["fieldKey"] ? { fieldKey: identifier(item["fieldKey"], "policyBinding.fieldKey") } : {}),
    inputMapping: object(item["inputMapping"], "policyBinding.inputMapping"),
  };
}

function validateListPresentation(presentation: EntityListPresentationDescriptor, fields: readonly EntityFieldDescriptor[]): void {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const requireField = (key: string, path: string): EntityFieldDescriptor => {
    const field = byKey.get(key);
    if (!field) throw new Error(`${path} references unknown field: ${key}`);
    return field;
  };
  if (presentation.identityField) requireField(presentation.identityField, "listPresentation.identityField");
  const columns = presentation.defaultState?.columns ?? presentation.defaultColumns ?? [];
  if (columns.length > 100) throw new Error("listPresentation default columns must not exceed one hundred fields");
  if (new Set(columns).size !== columns.length) throw new Error("listPresentation default columns must be unique");
  for (const field of columns) requireField(field, "listPresentation default columns");
  const sort = presentation.defaultState?.sort ?? presentation.defaultSort ?? [];
  const maxSortLevels = presentation.limits?.maxSortLevels ?? 3;
  if (sort.length > maxSortLevels) throw new Error(`listPresentation default sort exceeds maxSortLevels: ${maxSortLevels}`);
  if (new Set(sort.map((item) => item.field)).size !== sort.length) throw new Error("listPresentation default sort fields must be unique");
  for (const item of sort) if (!requireField(item.field, "listPresentation default sort").sortable) throw new Error(`listPresentation default sort field is not sortable: ${item.field}`);
  const filters = presentation.defaultState?.filters ?? [];
  if (filters.length > 20) throw new Error("listPresentation default filters must not exceed twenty rules");
  for (const item of filters) {
    const field = requireField(item.field, "listPresentation default filters");
    if (!field.filterable) throw new Error(`listPresentation default filter field is not filterable: ${item.field}`);
    const allowed = field.list?.filterOperators ?? entityFieldFilterOperators(field.type);
    if (!allowed.includes(item.operator)) throw new Error(`listPresentation default filter operator is not allowed for ${item.field}: ${item.operator}`);
  }
  const quickFields = presentation.filterPresentation?.quickFields ?? [];
  if (quickFields.length > 4) throw new Error("listPresentation quick filters must not exceed four fields");
  if (new Set(quickFields.map((item) => item.field)).size !== quickFields.length) throw new Error("listPresentation quick filter fields must be unique");
  for (const item of quickFields) {
    const field = requireField(item.field, "listPresentation quick filters");
    if (!field.filterable) throw new Error(`listPresentation quick filter field is not filterable: ${item.field}`);
    const allowed = field.list?.filterOperators ?? entityFieldFilterOperators(field.type);
    if (item.defaultOperator && !allowed.includes(item.defaultOperator)) throw new Error(`listPresentation quick filter operator is not allowed for ${item.field}: ${item.defaultOperator}`);
  }
  if (presentation.defaultState?.group && !requireField(presentation.defaultState.group, "listPresentation.defaultState.group").list?.groupable) throw new Error(`listPresentation default group field is not groupable: ${presentation.defaultState.group}`);
  if (presentation.defaultState?.mode && presentation.supportedModes && !presentation.supportedModes.includes(presentation.defaultState.mode)) throw new Error("listPresentation default mode must be supported");
  const allowedSizes = presentation.limits?.allowedPageSizes ?? presentation.allowedPageSizes;
  const defaultSize = presentation.limits?.defaultPageSize ?? presentation.defaultPageSize;
  if (allowedSizes && new Set(allowedSizes).size !== allowedSizes.length) throw new Error("listPresentation allowed page sizes must be unique");
  if (defaultSize !== undefined && allowedSizes && !allowedSizes.includes(defaultSize)) throw new Error("listPresentation default page size must be allowed");
}

function parseField(raw: unknown): EntityFieldDescriptor {
  const item = object(raw, "field");
  const type = string(item["type"], "field.type") as EntityFieldDescriptor["type"];
  if (!["string","text","integer","decimal","money","boolean","date","datetime","uuid","enum","reference","json"].includes(type)) throw new Error(`Unsupported field type: ${type}`);
  const writableOn = array(item["writableOn"], "field.writableOn").map((entry) => string(entry, "field.writableOn"));
  if (writableOn.some((entry) => entry !== "create" && entry !== "patch")) throw new Error("Invalid field write mode");
  const listValue = item["list"] === undefined ? undefined : object(item["list"], "field.list");
  const defaultOrder = listValue?.["defaultOrder"] === undefined ? undefined : boundedInteger(listValue["defaultOrder"], "field.list.defaultOrder", 0, 10_000);
  const defaultWidth = listValue?.["defaultWidth"] === undefined ? undefined : boundedInteger(listValue["defaultWidth"], "field.list.defaultWidth", 48, 1200);
  const list = listValue ? { ...(listValue["label"] === undefined ? {} : { label: string(listValue["label"], "field.list.label") }), ...(listValue["columnGroup"] === undefined ? {} : { columnGroup: string(listValue["columnGroup"], "field.list.columnGroup") }), ...(listValue["semanticRole"] === undefined ? {} : { semanticRole: code(listValue["semanticRole"], "field.list.semanticRole") }), ...(listValue["rendererKey"] === undefined ? {} : { rendererKey: code(listValue["rendererKey"], "field.list.rendererKey") }), ...(typeof listValue["defaultVisible"] === "boolean" ? { defaultVisible: listValue["defaultVisible"] } : {}), ...(defaultOrder !== undefined ? { defaultOrder } : {}), ...(defaultWidth !== undefined ? { defaultWidth } : {}), ...(typeof listValue["groupable"] === "boolean" ? { groupable: listValue["groupable"] } : {}), ...(listValue["filterOperators"] === undefined ? {} : { filterOperators: array(listValue["filterOperators"], "field.list.filterOperators").map((value) => filterOperator(value, "field.list.filterOperators item")) }), ...(listValue["aggregations"] === undefined ? {} : { aggregations: array(listValue["aggregations"], "field.list.aggregations").map((value) => oneOf(value, ["count", "sum", "average", "minimum", "maximum"] as const, "field.list.aggregations item")) }) } : undefined;
  if (list?.filterOperators) {
    if (new Set(list.filterOperators).size !== list.filterOperators.length) throw new Error(`Duplicate filter operator configured for field: ${item["key"]}`);
    const allowed = entityFieldFilterOperators(type);
    for (const operator of list.filterOperators) if (!allowed.includes(operator)) throw new Error(`Filter operator ${operator} is not valid for field type ${type}`);
  }
  if (list?.aggregations && new Set(list.aggregations).size !== list.aggregations.length) throw new Error(`Duplicate aggregation configured for field: ${item["key"]}`);
  return { ...(item["readPermissionCode"] === undefined ? {} : { readPermissionCode: code(item["readPermissionCode"], "field.readPermissionCode") }), ...(item["writePermissionCode"] === undefined ? {} : { writePermissionCode: code(item["writePermissionCode"], "field.writePermissionCode") }), ...(item["classification"] === undefined ? {} : { classification: oneOf(item["classification"], ["public", "internal", "confidential", "pii", "sensitive_pii"] as const, "field.classification") }), ...(item["retentionPolicyCode"] === undefined ? {} : { retentionPolicyCode: code(item["retentionPolicyCode"], "field.retentionPolicyCode") }), key: identifier(item["key"], "field.key"), storagePath: identifier(item["storagePath"], "field.storagePath"), type, required: item["required"] === true, writableOn: writableOn as ("create" | "patch")[], ...(item["filterable"] === true ? { filterable: true } : {}), ...(item["sortable"] === true ? { sortable: true } : {}), ...(item["searchable"] === true ? { searchable: true } : {}), ...(item["validation"] && typeof item["validation"] === "object" ? { validation: item["validation"] as Readonly<Record<string, unknown>> } : {}), ...(list ? { list } : {}) };
}

function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`); return value as Record<string, unknown>; }
function array(value: unknown, name: string): unknown[] { if (!Array.isArray(value)) throw new Error(`${name} must be an array`); return value; }
function string(value: unknown, name: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must be a string`); return value.trim(); }
function identifier(value: unknown, name: string): string { const result = string(value, name); if (!/^[a-z_][a-z0-9_]{0,62}$/.test(result)) throw new Error(`${name} must be a SQL identifier`); return result; }
function code(value: unknown, name: string): string { const result = string(value, name); if (!/^[a-z][a-z0-9_.:-]{1,126}$/.test(result)) throw new Error(`${name} must be a canonical code`); return result; }
function uuid(value: unknown, name: string): string { const result = string(value, name); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) throw new Error(`${name} must be a UUID`); return result; }
function hash(value: string, name: string): string { if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Invalid ${name}`); return value; }
function boundedInteger(value: unknown, name: string, minimum: number, maximum: number): number { if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`); return value; }
function oneOf<const T extends readonly string[]>(value: unknown, choices: T, name: string): T[number] { if (typeof value !== "string" || !choices.includes(value as T[number])) throw new Error(`${name} is invalid`); return value as T[number]; }
function boundedString(value: unknown, name: string, maximum: number): string { const result = string(value, name); if (result.length > maximum) throw new Error(`${name} must not exceed ${maximum} characters`); return result; }
function filterOperator(value: unknown, name: string): EntityListFilterOperator { return oneOf(value, ["eq", "ne", "in", "contains", "starts_with", "gt", "gte", "lt", "lte", "between", "is_null", "is_not_null", "relative"] as const, name); }
function parseSort(value: unknown, name: string) { return array(value, name).map((rawSort, index) => { const sort = object(rawSort, `${name}[${index}]`); const nulls = sort["nulls"] === undefined ? undefined : oneOf(sort["nulls"], ["first", "last"] as const, `${name}[${index}].nulls`); return { field: identifier(sort["field"], `${name}[${index}].field`), direction: oneOf(sort["direction"], ["asc", "desc"] as const, `${name}[${index}].direction`), ...(nulls ? { nulls } : {}) }; }); }
function jsonValue(value: unknown, name: string, depth = 0): unknown { if (depth > 16) throw new Error(`${name} exceeds maximum depth`); if (value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return value; if (Array.isArray(value)) return value.map((item, index) => jsonValue(item, `${name}[${index}]`, depth + 1)); if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, jsonValue(item, `${name}.${key}`, depth + 1)])); throw new Error(`${name} must be JSON-compatible`); }
