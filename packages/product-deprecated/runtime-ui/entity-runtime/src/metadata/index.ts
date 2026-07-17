export {
  DEFAULT_DISPLAY_CONFIG,
  type ResolvedDisplayConfig,
  type DetailRenderer,
  type ListRenderer,
  type ViewMode,
} from "./displayConfig.defaults";

export { resolvePresentationConfig } from "./displayConfig.resolve";

export {
  configuredAuditFieldNames,
  configuredCodeFieldName,
  configuredIdentityFieldNames,
  configuredListColumnNames,
  configuredStatusFieldNames,
  configuredSubtitleFieldName,
  configuredTitleFieldName,
  displayConfigRecord,
  documentHeaderRecord,
  editableEntityField,
  fieldByName,
  fieldExcludedFromCopy,
  fieldHiddenInSurface,
  fieldSettingRecord,
  fieldValue,
  fieldValueByName,
  uniqueFieldNames,
  type EntityAuditFieldNames,
} from "./fieldSemantics";

export {
  detailRendererMap,
  registerLinesRenderer,
  resolveLinesRenderer,
  type LinesRenderer,
  type LinesRendererProps,
  type DetailRendererKey,
} from "./renderer.registry";
