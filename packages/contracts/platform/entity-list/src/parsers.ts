import { parseEntityIntakeSurfaces } from "@athyper/contract-platform-entity-runtime";
import { parseEntityIntakeFlows } from "@athyper/contract-platform-entity-runtime";
import { parseEntityScopeFilters } from "./scope-filters";
import {
  parseEffectiveEntitySections,
  parseEntityApplication,
} from "./experience";
import {
  parseEntityListHeader,
  parseEntityLocalizedText,
  parseEntityNavigationHref,
} from "./experience";
import {
  ENTITY_LIST_MAX_FILTERS,
  ENTITY_LIST_MAX_SORT_LEVELS,
  ENTITY_LIST_MAX_VISIBLE_COLUMNS,
} from "./types";
import type {
  EffectiveListActionV1,
  EntityListDescriptorV1,
  EntityWorkContextRequirementV1,
  EntityListResultV1,
  JsonObject,
  JsonValue,
  ListCountMode,
  ListDensity,
  ListFieldDescriptorV1,
  ListFilterOperator,
  ListFilterV1,
  ListLocationStateV1,
  ListSortV1,
  ListViewMode,
  SaveableListStateV1,
} from "./types";

const MODES = [
  "table",
  "compact",
  "board",
  "dashboard",
  "spreadsheet",
] as const;
const DENSITIES = ["compact", "comfortable", "spacious"] as const;
const COUNT_MODES = ["none", "cached", "approximate", "exact"] as const;
const VALUE_KINDS = [
  "string",
  "text",
  "integer",
  "decimal",
  "money",
  "boolean",
  "date",
  "datetime",
  "uuid",
  "enum",
  "reference",
  "json",
] as const;
const FILTER_OPERATORS = [
  "eq",
  "ne",
  "in",
  "contains",
  "starts_with",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "is_null",
  "is_not_null",
  "relative",
] as const;
const AGGREGATIONS = ["count", "sum", "average", "minimum", "maximum"] as const;
const EXPORT_FORMATS = ["xlsx", "csv", "json", "ndjson"] as const;
const IMPORT_FORMATS = ["xlsx", "csv", "json"] as const;

export function parseEntityListDescriptor(
  value: unknown,
): EntityListDescriptorV1 {
  const record = object(value, "entity list descriptor");
  if (record.schemaVersion !== 1)
    throw new TypeError("entity list descriptor schemaVersion must be 1");
  const entityRecord = object(record.entity, "entity");
  const revisionRecord = object(record.revision, "revision");
  const surfaceRecord = object(record.surface, "surface");
  // Keep v1 descriptors emitted before search policy was introduced readable.
  // The compiler and server always emit the explicit canonical object now.
  const searchRecord =
    surfaceRecord.search === undefined
      ? {}
      : object(surfaceRecord.search, "surface.search");
  const scopeRecord = object(record.scope, "scope");
  const limitsRecord = object(record.limits, "limits");
  const fields = freezeUnique(
    array(record.fields, "fields").map(parseField),
    "field keys",
    (item) => item.key,
  );
  if (!fields.length)
    throw new TypeError("fields must contain at least one readable field");
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));
  const identityField = code(
    entityRecord.identityField,
    "entity.identityField",
  );
  if (!fieldByKey.has(identityField))
    throw new TypeError("entity.identityField must reference a readable field");
  const filterPresentationRecord =
    surfaceRecord.filterPresentation === undefined
      ? undefined
      : object(surfaceRecord.filterPresentation, "surface.filterPresentation");
  const quickCandidates =
    filterPresentationRecord?.quickFields === undefined
      ? []
      : array(
          filterPresentationRecord.quickFields,
          "surface.filterPresentation.quickFields",
        );
  if (quickCandidates.length > 4)
    throw new TypeError(
      "surface.filterPresentation.quickFields exceeds four fields",
    );
  const quickFields = freezeUnique(
    quickCandidates.flatMap((candidate, index) => {
      const item = object(
          candidate,
          `surface.filterPresentation.quickFields[${index}]`,
        ),
        fieldKey = code(
          item.field,
          `surface.filterPresentation.quickFields[${index}].field`,
        ),
        field = fieldByKey.get(fieldKey);
      if (!field?.filterOperators.length) return [];
      const requested =
        item.defaultOperator === undefined
          ? undefined
          : oneOf(
              item.defaultOperator,
              FILTER_OPERATORS,
              `surface.filterPresentation.quickFields[${index}].defaultOperator`,
            );
      const defaultOperator =
        requested && field.filterOperators.includes(requested)
          ? requested
          : preferredFilterOperator(field);
      return [Object.freeze({ field: fieldKey, defaultOperator })];
    }),
    "quick filter fields",
    (item) => item.field,
  );
  const resolvedQuickFields = quickFields.length
    ? quickFields
    : fallbackQuickFields(fields);
  const allowedPageSizes = uniqueIntegers(
    limitsRecord.allowedPageSizes,
    "limits.allowedPageSizes",
    1,
    500,
  );
  if (!allowedPageSizes.length)
    throw new TypeError("limits.allowedPageSizes must not be empty");
  const defaultPageSize = integer(
    limitsRecord.defaultPageSize,
    "limits.defaultPageSize",
    1,
    500,
  );
  if (!allowedPageSizes.includes(defaultPageSize))
    throw new TypeError("limits.defaultPageSize must be allowed");
  const maxSortLevels = integer(
    limitsRecord.maxSortLevels,
    "limits.maxSortLevels",
    0,
    ENTITY_LIST_MAX_SORT_LEVELS,
  );
  const supportedModes = uniqueEnums(
    surfaceRecord.supportedModes,
    MODES,
    "surface.supportedModes",
  );
  if (!supportedModes.length)
    throw new TypeError("surface.supportedModes must not be empty");
  const defaultState = parseState(surfaceRecord.defaultState, {
    fields: fieldByKey,
    identityField,
    supportedModes: new Set(supportedModes),
    maxSortLevels,
    allowedPageSizes: new Set(allowedPageSizes),
    defaultPageSize,
    includeLocation: false,
  });
  const entity = Object.freeze({
    code: code(entityRecord.code, "entity.code"),
    label: text(entityRecord.label, "entity.label"),
    pluralLabel: text(entityRecord.pluralLabel, "entity.pluralLabel"),
    identityField,
    ...(optionalRouteTemplate(entityRecord.detailRouteTemplate)
      ? {
          detailRouteTemplate: optionalRouteTemplate(
            entityRecord.detailRouteTemplate,
          ),
        }
      : {}),
  });
  const actions = freezeUnique(
    array(record.actions, "actions").map(parseAction),
    "action keys",
    (item) => item.key,
  );
  const dataOperations =
    record.dataOperations === undefined
      ? undefined
      : parseDataOperations(record.dataOperations, fieldByKey);
  const labels = freezeUnique(
    array(scopeRecord.labels, "scope.labels").map((candidate, index) => {
      const item = object(candidate, `scope.labels[${index}]`);
      return Object.freeze({
        key: code(item.key, `scope.labels[${index}].key`),
        label: text(item.label, `scope.labels[${index}].label`),
        value: text(item.value, `scope.labels[${index}].value`),
      });
    }),
    "scope label keys",
    (item) => item.key,
  );
  return Object.freeze({
    ...(record.serverViews === true ? { serverViews: true } : {}),
    ...(Array.isArray(record.standardViews)
      ? {
          standardViews: Object.freeze(
            record.standardViews.map((raw: unknown) => {
              const value = object(raw, "standardView");
              return {
                key: code(value.key, "standardView.key"),
                label: parseEntityLocalizedText(value.label),
                position: integer(
                  value.position,
                  "standardView.position",
                  0,
                  10000,
                ),
              };
            }),
          ),
        }
      : {}),
    schemaVersion: 1,
    plane: oneOf(record.plane, ["neon", "mesh", "studio"] as const, "plane"),
    entity,
    revision: Object.freeze({
      release: integer(revisionRecord.release, "revision.release", 1),
      descriptorHash: digest(
        revisionRecord.descriptorHash,
        "revision.descriptorHash",
      ),
      surfaceHash: digest(revisionRecord.surfaceHash, "revision.surfaceHash"),
    }),
    surface: Object.freeze({
      key: code(surfaceRecord.key, "surface.key"),
      title: text(surfaceRecord.title, "surface.title"),
      ...(surfaceRecord.header === undefined
        ? {}
        : { header: parseEntityListHeader(surfaceRecord.header) }),
      ...(optionalText(surfaceRecord.description, "surface.description")
        ? {
            description: optionalText(
              surfaceRecord.description,
              "surface.description",
            ),
          }
        : {}),
      defaultState,
      supportedModes,
      search: Object.freeze({
        ...(optionalCode(searchRecord.profileKey, "surface.search.profileKey")
          ? {
              profileKey: optionalCode(
                searchRecord.profileKey,
                "surface.search.profileKey",
              ),
            }
          : {}),
        minimumQueryLength:
          searchRecord.minimumQueryLength === undefined
            ? 1
            : integer(
                searchRecord.minimumQueryLength,
                "surface.search.minimumQueryLength",
                1,
                64,
              ),
      }),
      filterPresentation: Object.freeze({
        quickFields: resolvedQuickFields,
        source: quickFields.length ? "metadata" : "fallback",
        allowUserPinning: filterPresentationRecord?.allowUserPinning === true,
      }),
    }),
    fields,
    actions,
    ...(record.application === undefined
      ? {}
      : { application: parseEntityApplication(record.application) }),
    ...(record.navigation === undefined
      ? {}
      : { navigation: parseEffectiveEntitySections(record.navigation) }),
    ...(record.currentSurfaceKey === undefined
      ? {}
      : {
          currentSurfaceKey: code(
            record.currentSurfaceKey,
            "currentSurfaceKey",
          ),
        }),
    ...(dataOperations ? { dataOperations } : {}),
    scope: Object.freeze({
      ...(scopeRecord.workContext === undefined
        ? {}
        : {
            workContext: parseEntityWorkContextRequirement(
              scopeRecord.workContext,
            ),
          }),
      ...(scopeRecord.quickFilters === undefined
        ? {}
        : { quickFilters: parseEntityScopeFilters(scopeRecord.quickFilters) }),
      ...(scopeRecord.filterKinds === undefined
        ? {}
        : {
            filterKinds: uniqueEnums(
              scopeRecord.filterKinds,
              ["organization", "company"] as const,
              "scope.filterKinds",
            ),
          }),
      status: oneOf(
        scopeRecord.status,
        ["ready", "context_required"] as const,
        "scope.status",
      ),
      labels,
      fingerprint: digest(scopeRecord.fingerprint, "scope.fingerprint"),
    }),
    limits: Object.freeze({
      defaultPageSize,
      allowedPageSizes,
      maxSortLevels,
      countMode: oneOf(limitsRecord.countMode, COUNT_MODES, "limits.countMode"),
    }),
  });
}

function parseDataOperations(
  value: unknown,
  fields: ReadonlyMap<string, ListFieldDescriptorV1>,
) {
  const root = object(value, "dataOperations"),
    exportRecord = object(root.export, "dataOperations.export"),
    importRecord = object(root.import, "dataOperations.import");
  const exportFormats = uniqueEnums(
    exportRecord.formats,
    EXPORT_FORMATS,
    "dataOperations.export.formats",
  );
  const importFormats = uniqueEnums(
    importRecord.formats,
    IMPORT_FORMATS,
    "dataOperations.import.formats",
  );
  if (!exportFormats.length || !importFormats.length)
    throw new TypeError("data operation formats must not be empty");
  const defaultExportFormat = oneOf(
    exportRecord.defaultFormat,
    EXPORT_FORMATS,
    "dataOperations.export.defaultFormat",
  );
  const defaultImportFormat = oneOf(
    importRecord.defaultFormat,
    IMPORT_FORMATS,
    "dataOperations.import.defaultFormat",
  );
  if (!exportFormats.includes(defaultExportFormat))
    throw new TypeError("default export format must be allowed");
  if (!importFormats.includes(defaultImportFormat))
    throw new TypeError("default import format must be allowed");
  const exportableFields = uniqueCodes(
    exportRecord.exportableFields,
    "dataOperations.export.exportableFields",
  ).filter((key) => fields.has(key));
  const importableFields = uniqueCodes(
    importRecord.importableFields,
    "dataOperations.import.importableFields",
  ).filter((key) => fields.has(key));
  return Object.freeze({
    export: Object.freeze({
      currentPage: parseDataOperation(
        exportRecord.currentPage,
        "dataOperations.export.currentPage",
      ),
      selected: parseDataOperation(
        exportRecord.selected,
        "dataOperations.export.selected",
      ),
      filtered: parseDataOperation(
        exportRecord.filtered,
        "dataOperations.export.filtered",
      ),
      all: parseDataOperation(exportRecord.all, "dataOperations.export.all"),
      formats: exportFormats,
      defaultFormat: defaultExportFormat,
      exportableFields: Object.freeze(exportableFields),
      asynchronousThreshold: integer(
        exportRecord.asynchronousThreshold,
        "dataOperations.export.asynchronousThreshold",
        1,
        10_000_000,
      ),
    }),
    import: Object.freeze({
      create: parseDataOperation(
        importRecord.create,
        "dataOperations.import.create",
      ),
      update: parseDataOperation(
        importRecord.update,
        "dataOperations.import.update",
      ),
      upsert: parseDataOperation(
        importRecord.upsert,
        "dataOperations.import.upsert",
      ),
      ...(importRecord.delete === undefined
        ? {}
        : {
            delete: parseDataOperation(
              importRecord.delete,
              "dataOperations.import.delete",
            ),
          }),
      ...(importRecord.replace === undefined
        ? {}
        : {
            replace: parseDataOperation(
              importRecord.replace,
              "dataOperations.import.replace",
            ),
          }),
      downloadTemplate: parseDataOperation(
        importRecord.downloadTemplate,
        "dataOperations.import.downloadTemplate",
      ),
      formats: importFormats,
      defaultFormat: defaultImportFormat,
      importableFields: Object.freeze(importableFields),
      maxFileBytes: integer(
        importRecord.maxFileBytes,
        "dataOperations.import.maxFileBytes",
        1,
        1_000_000_000,
      ),
      maxRows: integer(
        importRecord.maxRows,
        "dataOperations.import.maxRows",
        1,
        10_000_000,
      ),
      draftOnly: boolean(
        importRecord.draftOnly,
        "dataOperations.import.draftOnly",
      ),
    }),
  });
}

function parseDataOperation(value: unknown, name: string) {
  const item = object(value, name),
    state = oneOf(
      item.state,
      ["enabled", "disabled", "hidden"] as const,
      `${name}.state`,
    );
  const reason =
    item.disabledReason === undefined
      ? undefined
      : object(item.disabledReason, `${name}.disabledReason`);
  if (state === "disabled" && !reason)
    throw new TypeError(`${name}.disabledReason is required when disabled`);
  return Object.freeze({
    state,
    ...(optionalInteger(
      item.maxRecords,
      `${name}.maxRecords`,
      1,
      10_000_000,
    ) !== undefined
      ? {
          maxRecords: optionalInteger(
            item.maxRecords,
            `${name}.maxRecords`,
            1,
            10_000_000,
          ),
        }
      : {}),
    ...(optionalCode(item.requiredPermission, `${name}.requiredPermission`)
      ? {
          requiredPermission: optionalCode(
            item.requiredPermission,
            `${name}.requiredPermission`,
          ),
        }
      : {}),
    requiresPreflight: boolean(
      item.requiresPreflight,
      `${name}.requiresPreflight`,
    ),
    requiresApproval: boolean(
      item.requiresApproval,
      `${name}.requiresApproval`,
    ),
    ...(reason
      ? {
          disabledReason: Object.freeze({
            code: reasonCode(reason.code, `${name}.disabledReason.code`),
            message: text(reason.message, `${name}.disabledReason.message`),
          }),
        }
      : {}),
  });
}

export function parseEntityListResult(value: unknown): EntityListResultV1 {
  const record = object(value, "entity list result");
  if (record.schemaVersion !== 1)
    throw new TypeError("entity list result schemaVersion must be 1");
  const paginationRecord = object(record.pagination, "pagination");
  const rows = Object.freeze(
    array(record.rows, "rows").map((candidate, index) => {
      const row = object(candidate, `rows[${index}]`);
      const version = optionalInteger(row.version, `rows[${index}].version`, 0);
      const decorationRecord =
        row.decoration === undefined
          ? undefined
          : object(row.decoration, `rows[${index}].decoration`);
      const decoration = decorationRecord
        ? Object.freeze({
            ...(optionalInteger(
              decorationRecord.commentCount,
              `rows[${index}].decoration.commentCount`,
              0,
            ) !== undefined
              ? {
                  commentCount: optionalInteger(
                    decorationRecord.commentCount,
                    `rows[${index}].decoration.commentCount`,
                    0,
                  ),
                }
              : {}),
            ...(optionalBoolean(
              decorationRecord.hasOpenComment,
              `rows[${index}].decoration.hasOpenComment`,
            ) !== undefined
              ? {
                  hasOpenComment: optionalBoolean(
                    decorationRecord.hasOpenComment,
                    `rows[${index}].decoration.hasOpenComment`,
                  ),
                }
              : {}),
            ...(optionalBoolean(
              decorationRecord.bookmarked,
              `rows[${index}].decoration.bookmarked`,
            ) !== undefined
              ? {
                  bookmarked: optionalBoolean(
                    decorationRecord.bookmarked,
                    `rows[${index}].decoration.bookmarked`,
                  ),
                }
              : {}),
          })
        : undefined;
      return Object.freeze({
        id: text(row.id, `rows[${index}].id`),
        ...(version !== undefined ? { version } : {}),
        values: jsonObject(row.values, `rows[${index}].values`),
        ...(decoration ? { decoration } : {}),
      });
    }),
  );
  const countMode = oneOf(
    paginationRecord.countMode,
    COUNT_MODES,
    "pagination.countMode",
  );
  const requestedCountMode =
    paginationRecord.requestedCountMode === undefined
      ? undefined
      : oneOf(
          paginationRecord.requestedCountMode,
          COUNT_MODES,
          "pagination.requestedCountMode",
        );
  const total = optionalInteger(paginationRecord.total, "pagination.total", 0);
  if (countMode === "none" && total !== undefined)
    throw new TypeError(
      "pagination.total is not allowed when countMode is none",
    );
  const facets =
    record.facets === undefined
      ? undefined
      : parseBucketsByField(record.facets, "facets");
  const groups =
    record.groups === undefined
      ? undefined
      : parseBuckets(record.groups, "groups");
  return Object.freeze({
    schemaVersion: 1,
    descriptorHash: digest(record.descriptorHash, "descriptorHash"),
    scopeFingerprint: digest(record.scopeFingerprint, "scopeFingerprint"),
    queryHash: digest(record.queryHash, "queryHash"),
    rows,
    pagination: Object.freeze({
      pageSize: integer(
        paginationRecord.pageSize,
        "pagination.pageSize",
        0,
        500,
      ),
      hasNext: boolean(paginationRecord.hasNext, "pagination.hasNext"),
      ...(optionalText(paginationRecord.nextCursor, "pagination.nextCursor")
        ? {
            nextCursor: optionalText(
              paginationRecord.nextCursor,
              "pagination.nextCursor",
            ),
          }
        : {}),
      hasPrevious: boolean(
        paginationRecord.hasPrevious,
        "pagination.hasPrevious",
      ),
      ...(optionalText(
        paginationRecord.previousCursor,
        "pagination.previousCursor",
      )
        ? {
            previousCursor: optionalText(
              paginationRecord.previousCursor,
              "pagination.previousCursor",
            ),
          }
        : {}),
      ...(total !== undefined ? { total } : {}),
      countMode,
      ...(requestedCountMode ? { requestedCountMode } : {}),
      ...(optionalTimestamp(paginationRecord.totalAsOf, "pagination.totalAsOf")
        ? {
            totalAsOf: optionalTimestamp(
              paginationRecord.totalAsOf,
              "pagination.totalAsOf",
            ),
          }
        : {}),
    }),
    ...(facets ? { facets } : {}),
    ...(groups ? { groups } : {}),
  });
}

export function parseListLocationState(
  value: unknown,
  descriptor: EntityListDescriptorV1,
): ListLocationStateV1 {
  return parseState(value, stateRules(descriptor, true)) as ListLocationStateV1;
}

export function parseSaveableListState(
  value: unknown,
  descriptor: EntityListDescriptorV1,
): SaveableListStateV1 {
  return parseState(value, stateRules(descriptor, false));
}

function stateRules(
  descriptor: EntityListDescriptorV1,
  includeLocation: boolean,
): StateRules {
  return {
    fields: new Map(descriptor.fields.map((field) => [field.key, field])),
    identityField: descriptor.entity.identityField,
    supportedModes: new Set(descriptor.surface.supportedModes),
    maxSortLevels: descriptor.limits.maxSortLevels,
    allowedPageSizes: new Set(descriptor.limits.allowedPageSizes),
    defaultPageSize: descriptor.limits.defaultPageSize,
    includeLocation,
  };
}

interface StateRules {
  readonly fields: ReadonlyMap<string, ListFieldDescriptorV1>;
  readonly identityField: string;
  readonly supportedModes: ReadonlySet<ListViewMode>;
  readonly maxSortLevels: number;
  readonly allowedPageSizes: ReadonlySet<number>;
  readonly defaultPageSize: number;
  readonly includeLocation: boolean;
}

function parseState(
  value: unknown,
  rules: StateRules,
): SaveableListStateV1 | ListLocationStateV1 {
  const record = object(value, "list state");
  const filters: ListFilterV1[] = [];
  for (const [index, candidate] of array(record.filters, "filters").entries()) {
    if (filters.length >= ENTITY_LIST_MAX_FILTERS) break;
    const item = object(candidate, `filters[${index}]`);
    const field = code(item.field, `filters[${index}].field`);
    const descriptor = rules.fields.get(field);
    if (!descriptor) continue;
    const operator = oneOf(
      item.operator,
      FILTER_OPERATORS,
      `filters[${index}].operator`,
    );
    if (!descriptor.filterOperators.includes(operator)) continue;
    const value =
      item.value === undefined
        ? undefined
        : json(item.value, `filters[${index}].value`);
    filters.push(
      Object.freeze({
        field,
        operator,
        ...(value !== undefined ? { value } : {}),
      }),
    );
  }
  const sort: ListSortV1[] = [];
  const sortedFields = new Set<string>();
  for (const [index, candidate] of array(record.sort, "sort").entries()) {
    if (sort.length >= rules.maxSortLevels) break;
    const item = object(candidate, `sort[${index}]`);
    const field = code(item.field, `sort[${index}].field`);
    if (!rules.fields.get(field)?.sortable || sortedFields.has(field)) continue;
    sortedFields.add(field);
    const nulls =
      item.nulls === undefined
        ? undefined
        : oneOf(item.nulls, ["first", "last"] as const, `sort[${index}].nulls`);
    sort.push(
      Object.freeze({
        field,
        direction: oneOf(
          item.direction,
          ["asc", "desc"] as const,
          `sort[${index}].direction`,
        ),
        ...(nulls ? { nulls } : {}),
      }),
    );
  }
  const columns = uniqueCodes(record.columns, "columns")
    .filter((key) => rules.fields.has(key))
    .slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS);
  if (!columns.includes(rules.identityField))
    columns.unshift(rules.identityField);
  if (columns.length > ENTITY_LIST_MAX_VISIBLE_COLUMNS)
    columns.length = ENTITY_LIST_MAX_VISIBLE_COLUMNS;
  const requestedMode = oneOf(record.mode, MODES, "mode");
  const mode = rules.supportedModes.has(requestedMode)
    ? requestedMode
    : rules.supportedModes.values().next().value;
  if (!mode) throw new TypeError("list state has no supported mode");
  const groupCandidate = optionalCode(record.group, "group");
  const group =
    groupCandidate && rules.fields.get(groupCandidate)?.groupable
      ? groupCandidate
      : undefined;
  const spreadsheet =
    record.spreadsheet === undefined
      ? undefined
      : parseSpreadsheet(record.spreadsheet, rules.fields);
  const base = {
    ...(optionalCode(record.standardViewKey, "standardViewKey")
      ? {
          standardViewKey: optionalCode(
            record.standardViewKey,
            "standardViewKey",
          ),
        }
      : {}),
    ...(optionalQuery(record.query)
      ? { query: optionalQuery(record.query) }
      : {}),
    filters: Object.freeze(filters),
    sort: Object.freeze(sort),
    ...(group ? { group } : {}),
    columns: Object.freeze(columns),
    density: oneOf(record.density, DENSITIES, "density") as ListDensity,
    mode,
    ...(spreadsheet ? { spreadsheet } : {}),
  };
  if (!rules.includeLocation) return Object.freeze(base);
  const pageSize =
    record.pageSize === undefined
      ? undefined
      : integer(record.pageSize, "pageSize", 1, 500);
  return Object.freeze({
    ...base,
    ...(optionalText(record.savedViewId, "savedViewId")
      ? { savedViewId: optionalText(record.savedViewId, "savedViewId") }
      : {}),
    ...(optionalText(record.baseSavedViewId, "baseSavedViewId")
      ? {
          baseSavedViewId: optionalText(
            record.baseSavedViewId,
            "baseSavedViewId",
          ),
        }
      : {}),
    ...(optionalText(record.cursor, "cursor")
      ? { cursor: optionalText(record.cursor, "cursor") }
      : {}),
    ...(optionalInteger(record.pageIndex, "pageIndex", 0) !== undefined
      ? { pageIndex: optionalInteger(record.pageIndex, "pageIndex", 0) }
      : {}),
    ...(pageSize !== undefined && rules.allowedPageSizes.has(pageSize)
      ? { pageSize }
      : { pageSize: rules.defaultPageSize }),
  });
}

function parseField(candidate: unknown, index: number): ListFieldDescriptorV1 {
  const field = object(candidate, `fields[${index}]`);
  const defaultWidth = optionalInteger(
    field.defaultWidth,
    `fields[${index}].defaultWidth`,
    48,
    1200,
  );
  const filterOptionCandidates =
    field.filterOptions === undefined
      ? undefined
      : array(field.filterOptions, `fields[${index}].filterOptions`);
  if (filterOptionCandidates && filterOptionCandidates.length > 500)
    throw new TypeError(`fields[${index}].filterOptions exceeds 500 choices`);
  const filterOptions =
    filterOptionCandidates === undefined
      ? undefined
      : freezeUnique(
          filterOptionCandidates.map((candidate, optionIndex) => {
            const option = object(
              candidate,
              `fields[${index}].filterOptions[${optionIndex}]`,
            );
            if (!["string", "number", "boolean"].includes(typeof option.value))
              throw new TypeError(
                `fields[${index}].filterOptions[${optionIndex}].value must be scalar`,
              );
            return Object.freeze({
              value: option.value as string | number | boolean,
              label: text(
                option.label,
                `fields[${index}].filterOptions[${optionIndex}].label`,
              ),
            });
          }),
          `fields[${index}].filterOptions values`,
          (option) => `${typeof option.value}:${String(option.value)}`,
        );
  return Object.freeze({
    key: code(field.key, `fields[${index}].key`),
    label: text(field.label, `fields[${index}].label`),
    ...(optionalText(field.columnGroup, `fields[${index}].columnGroup`)
      ? {
          columnGroup: optionalText(
            field.columnGroup,
            `fields[${index}].columnGroup`,
          ),
        }
      : {}),
    valueKind: oneOf(
      field.valueKind,
      VALUE_KINDS,
      `fields[${index}].valueKind`,
    ),
    ...(optionalCode(field.semanticRole, `fields[${index}].semanticRole`)
      ? {
          semanticRole: optionalCode(
            field.semanticRole,
            `fields[${index}].semanticRole`,
          ),
        }
      : {}),
    ...(optionalCode(field.rendererKey, `fields[${index}].rendererKey`)
      ? {
          rendererKey: optionalCode(
            field.rendererKey,
            `fields[${index}].rendererKey`,
          ),
        }
      : {}),
    ...(field.formatting !== undefined
      ? {
          formatting: jsonObject(
            field.formatting,
            `fields[${index}].formatting`,
          ),
        }
      : {}),
    ...(filterOptions ? { filterOptions } : {}),
    defaultVisible: boolean(
      field.defaultVisible,
      `fields[${index}].defaultVisible`,
    ),
    defaultOrder: integer(
      field.defaultOrder,
      `fields[${index}].defaultOrder`,
      0,
      10_000,
    ),
    ...(defaultWidth !== undefined ? { defaultWidth } : {}),
    filterOperators: uniqueEnums(
      field.filterOperators,
      FILTER_OPERATORS,
      `fields[${index}].filterOperators`,
    ),
    sortable: boolean(field.sortable, `fields[${index}].sortable`),
    groupable: boolean(field.groupable, `fields[${index}].groupable`),
    aggregations: uniqueEnums(
      field.aggregations,
      AGGREGATIONS,
      `fields[${index}].aggregations`,
    ),
  });
}

function fallbackQuickFields(fields: readonly ListFieldDescriptorV1[]) {
  return Object.freeze(
    fields
      .filter((field) => field.filterOperators.length)
      .sort((left, right) => filterPriority(left) - filterPriority(right))
      .slice(0, 4)
      .map((field) =>
        Object.freeze({
          field: field.key,
          defaultOperator: preferredFilterOperator(field),
        }),
      ),
  );
}

function filterPriority(field: ListFieldDescriptorV1): number {
  const value = `${field.key} ${field.label}`;
  return field.semanticRole === "status" || /\bstatus\b/i.test(value)
    ? 0
    : /category|group/i.test(value)
      ? 1
      : field.semanticRole === "country_code" || /country/i.test(value)
        ? 2
        : field.semanticRole === "updated_at" || /updated|modified/i.test(value)
          ? 3
          : 10 + field.defaultOrder;
}
function preferredFilterOperator(
  field: ListFieldDescriptorV1,
): ListFilterOperator {
  const preferred =
    field.valueKind === "date" || field.valueKind === "datetime"
      ? "relative"
      : field.filterOptions?.length ||
          field.valueKind === "enum" ||
          field.valueKind === "boolean" ||
          field.valueKind === "reference"
        ? "eq"
        : "contains";
  return field.filterOperators.includes(preferred)
    ? preferred
    : field.filterOperators[0]!;
}

function parseAction(candidate: unknown, index: number): EffectiveListActionV1 {
  const action = object(candidate, `actions[${index}]`);
  const state = oneOf(
    action.state,
    ["enabled", "disabled", "hidden"] as const,
    `actions[${index}].state`,
  );
  const disabledRecord =
    action.disabledReason === undefined
      ? undefined
      : object(action.disabledReason, `actions[${index}].disabledReason`);
  if (state === "disabled" && !disabledRecord)
    throw new TypeError(
      `actions[${index}].disabledReason is required for a disabled action`,
    );
  return Object.freeze({
    key: code(action.key, `actions[${index}].key`),
    label: text(action.label, `actions[${index}].label`),
    ...(action.localizedLabel === undefined
      ? {}
      : { localizedLabel: parseEntityLocalizedText(action.localizedLabel) }),
    ...(action.href === undefined
      ? {}
      : { href: parseEntityNavigationHref(action.href) }),
    ...(action.disabledMessage === undefined
      ? {}
      : { disabledMessage: parseEntityLocalizedText(action.disabledMessage) }),
    ...(optionalCode(action.iconKey, `actions[${index}].iconKey`)
      ? { iconKey: optionalCode(action.iconKey, `actions[${index}].iconKey`) }
      : {}),
    placement: oneOf(
      action.placement,
      [
        "primary",
        "secondary",
        "toolbar",
        "row",
        "selection",
        "overflow",
      ] as const,
      `actions[${index}].placement`,
    ),
    selection: oneOf(
      action.selection,
      ["none", "single", "multiple"] as const,
      `actions[${index}].selection`,
    ),
    execution: oneOf(
      action.execution,
      ["navigate", "synchronous", "asynchronous"] as const,
      `actions[${index}].execution`,
    ),
    state,
    ...(disabledRecord
      ? {
          disabledReason: Object.freeze({
            code: reasonCode(
              disabledRecord.code,
              `actions[${index}].disabledReason.code`,
            ),
            messageKey: messageKey(
              disabledRecord.messageKey,
              `actions[${index}].disabledReason.messageKey`,
            ),
          }),
        }
      : {}),
    requiresPreflight: boolean(
      action.requiresPreflight,
      `actions[${index}].requiresPreflight`,
    ),
    supportsAllMatching: boolean(
      action.supportsAllMatching,
      `actions[${index}].supportsAllMatching`,
    ),
  });
}

function parseSpreadsheet(
  value: unknown,
  fields: ReadonlyMap<string, ListFieldDescriptorV1>,
) {
  const record = object(value, "spreadsheet");
  const pinned = uniqueCodes(record.pinned, "spreadsheet.pinned")
    .filter((key) => fields.has(key))
    .slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS);
  const widthsRecord = object(record.widths, "spreadsheet.widths");
  const widths = Object.freeze(
    Object.fromEntries(
      Object.entries(widthsRecord)
        .filter(([key]) => fields.has(key))
        .slice(0, ENTITY_LIST_MAX_VISIBLE_COLUMNS)
        .map(([key, width]) => [
          key,
          integer(width, `spreadsheet.widths.${key}`, 48, 1200),
        ]),
    ),
  );
  return Object.freeze({ pinned: Object.freeze(pinned), widths });
}

function parseBucketsByField(value: unknown, name: string) {
  const record = object(value, name);
  return Object.freeze(
    Object.fromEntries(
      Object.entries(record).map(([field, buckets]) => [
        code(field, `${name} field`),
        parseBuckets(buckets, `${name}.${field}`),
      ]),
    ),
  );
}

function parseBuckets(value: unknown, name: string) {
  return Object.freeze(
    array(value, name).map((candidate, index) => {
      const item = object(candidate, `${name}[${index}]`);
      const count = optionalInteger(item.count, `${name}[${index}].count`, 0);
      return Object.freeze({
        value: json(item.value, `${name}[${index}].value`),
        label: text(item.label, `${name}[${index}].label`),
        ...(count !== undefined ? { count } : {}),
      });
    }),
  );
}

function jsonObject(value: unknown, name: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an object`);
  return json(value, name) as JsonObject;
}

function json(value: unknown, name: string, depth = 0): JsonValue {
  if (depth > 8) throw new TypeError(`${name} exceeds maximum JSON depth`);
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (value.length > 100)
      throw new TypeError(`${name} exceeds maximum array length`);
    return Object.freeze(
      value.map((item, index) => json(item, `${name}[${index}]`, depth + 1)),
    );
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length > 100)
      throw new TypeError(`${name} exceeds maximum property count`);
    for (const [key] of entries)
      if (key === "__proto__" || key === "prototype" || key === "constructor")
        throw new TypeError(`${name} contains an unsafe property`);
    return Object.freeze(
      Object.fromEntries(
        entries.map(([key, item]) => [
          key,
          json(item, `${name}.${key}`, depth + 1),
        ]),
      ),
    );
  }
  throw new TypeError(`${name} must be JSON-compatible`);
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError(`${name} must be an object`);
  return value as Record<string, unknown>;
}
function array(value: unknown, name: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  return value;
}
function text(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new TypeError(`${name} must be non-empty`);
  return value.trim();
}
function optionalText(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : text(value, name);
}
function optionalQuery(value: unknown): string | undefined {
  const result = optionalText(value, "query");
  if (result && result.length > 512)
    throw new TypeError("query exceeds 512 characters");
  return result;
}
function boolean(value: unknown, name: string): boolean {
  if (typeof value !== "boolean")
    throw new TypeError(`${name} must be boolean`);
  return value;
}
function optionalBoolean(value: unknown, name: string): boolean | undefined {
  return value === undefined ? undefined : boolean(value, name);
}
function integer(
  value: unknown,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new TypeError(
      `${name} must be an integer from ${minimum} to ${maximum}`,
    );
  return value;
}
function optionalInteger(
  value: unknown,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number | undefined {
  return value === undefined
    ? undefined
    : integer(value, name, minimum, maximum);
}
function code(value: unknown, name: string): string {
  const result = text(value, name);
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(result))
    throw new TypeError(`${name} must be a catalog code`);
  return result;
}
function optionalCode(value: unknown, name: string): string | undefined {
  return value === undefined ? undefined : code(value, name);
}
function reasonCode(value: unknown, name: string): string {
  const result = text(value, name);
  if (!/^[A-Z][A-Z0-9_]{2,127}$/.test(result))
    throw new TypeError(`${name} must be a reason code`);
  return result;
}
function messageKey(value: unknown, name: string): string {
  const result = text(value, name);
  if (!/^[a-z][a-z0-9_.-]{2,190}$/.test(result))
    throw new TypeError(`${name} must be a message key`);
  return result;
}
function digest(value: unknown, name: string): string {
  const result = text(value, name);
  if (!/^(?:sha256:)?[a-f0-9]{64}$/.test(result))
    throw new TypeError(`${name} must be a SHA-256 digest`);
  return result;
}
function optionalRouteTemplate(value: unknown): string | undefined {
  const result = optionalText(value, "entity.detailRouteTemplate");
  if (
    result &&
    (!result.startsWith("/") ||
      result.includes("..") ||
      !result.includes(":recordId"))
  )
    throw new TypeError(
      "entity.detailRouteTemplate must be a safe route containing :recordId",
    );
  return result;
}
function optionalTimestamp(value: unknown, name: string): string | undefined {
  const result = optionalText(value, name);
  if (
    result &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(result)
  )
    throw new TypeError(`${name} must be a UTC timestamp`);
  return result;
}
function oneOf<const T extends readonly string[]>(
  value: unknown,
  values: T,
  name: string,
): T[number] {
  if (typeof value !== "string" || !values.includes(value as T[number]))
    throw new TypeError(`${name} is invalid`);
  return value as T[number];
}
function uniqueCodes(value: unknown, name: string): string[] {
  return [
    ...new Set(
      array(value, name).map((item, index) => code(item, `${name}[${index}]`)),
    ),
  ];
}
function uniqueIntegers(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): readonly number[] {
  return Object.freeze([
    ...new Set(
      array(value, name).map((item, index) =>
        integer(item, `${name}[${index}]`, minimum, maximum),
      ),
    ),
  ]);
}
function uniqueEnums<const T extends readonly string[]>(
  value: unknown,
  values: T,
  name: string,
): readonly T[number][] {
  return Object.freeze([
    ...new Set(
      array(value, name).map((item, index) =>
        oneOf(item, values, `${name}[${index}]`),
      ),
    ),
  ]);
}
function freezeUnique<T>(
  items: readonly T[],
  name: string,
  key: (item: T) => string,
): readonly T[] {
  if (new Set(items.map(key)).size !== items.length)
    throw new TypeError(`${name} must be unique`);
  return Object.freeze([...items]);
}

export const listContractValues = Object.freeze({
  modes: MODES,
  densities: DENSITIES,
  countModes: COUNT_MODES,
  filterOperators: FILTER_OPERATORS,
});
export type { ListCountMode, ListFilterOperator, ListViewMode };

export function parseEntityApplicationDescriptor(
  raw: unknown,
): import("./types").EntityApplicationDescriptorV1 {
  const value = object(raw, "application descriptor"),
    entity = object(value.entity, "entity"),
    surface = object(value.surface, "surface"),
    revision = object(value.revision, "revision"),
    scope = object(value.scope, "scope");
  if (value.schemaVersion !== 1)
    throw new TypeError("Unsupported application descriptor");
  const intakeSurfaces = parseEntityIntakeSurfaces(value["intakeSurfaces"] ?? []);
  const intakeFlows=parseEntityIntakeFlows(value.intakeFlows ?? []);
  return Object.freeze({
    schemaVersion: 1,
    ...(intakeFlows.length ? {intakeFlows} : {}),
    ...(intakeSurfaces.length ? {intakeSurfaces} : {}),
    plane: oneOf(value.plane, ["neon", "mesh", "studio"] as const, "plane"),
    entity: Object.freeze({
      code: code(entity.code, "entity.code"),
      label: text(entity.label, "entity.label"),
      pluralLabel: text(entity.pluralLabel, "entity.pluralLabel"),
    }),
    surface: Object.freeze({
      key: code(surface.key, "surface.key"),
      title: text(surface.title, "surface.title"),
      ...(surface.header === undefined
        ? {}
        : { header: parseEntityListHeader(surface.header) }),
      ...(surface.description === undefined
        ? {}
        : { description: text(surface.description, "surface.description") }),
    }),
    revision: Object.freeze({
      release: integer(revision.release, "release", 1),
      descriptorHash: digest(revision.descriptorHash, "descriptorHash"),
      surfaceHash: digest(revision.surfaceHash, "surfaceHash"),
    }),
    scope: Object.freeze({
      ...(scope.workContext === undefined
        ? {}
        : {
            workContext: parseEntityWorkContextRequirement(scope.workContext),
          }),
      status: oneOf(
        scope.status,
        ["ready", "context_required"] as const,
        "scope.status",
      ),
      fingerprint: digest(scope.fingerprint, "scope.fingerprint"),
      labels: Object.freeze(
        array(scope.labels, "labels").map((raw) => {
          const item = object(raw, "label");
          return Object.freeze({
            key: code(item.key, "key"),
            label: text(item.label, "label"),
            value: text(item.value, "value"),
          });
        }),
      ),
    }),
    actions: Object.freeze(array(value.actions, "actions").map(parseAction)),
    navigation: parseEffectiveEntitySections(value.navigation ?? []),
    ...(value.application === undefined
      ? {}
      : { application: parseEntityApplication(value.application) }),
  });
}

export function parseEntityWorkContextRequirement(
  value: unknown,
): EntityWorkContextRequirementV1 {
  const input = object(value, "scope.workContext");
  if (input.schemaVersion !== 1)
    throw new Error("Unsupported work-context requirement version");
  if (
    Object.keys(input).some(
      (key) =>
        !["schemaVersion", "resolver", "requiredCoordinates"].includes(key),
    )
  )
    throw new Error("Unknown work-context requirement property");
  const requiredCoordinates = uniqueEnums(
    input.requiredCoordinates,
    ["operatingOrganizationId", "companyCodeId", "legalEntityId"] as const,
    "scope.workContext.requiredCoordinates",
  );
  if (!requiredCoordinates.length)
    throw new Error("Work-context requirement must contain coordinates");
  return Object.freeze({
    schemaVersion: 1,
    resolver: text(input.resolver, "scope.workContext.resolver"),
    requiredCoordinates,
  });
}
