export {
  CURRENT_FRAMEWORK_VERSION,
  SourceAdapterRegistry,
  type RegisterContext,
  type RegisterResult,
} from "./registry";

export {
  SourceAdapterRegistryProvider,
  useSourceAdapterRegistry,
  useOptionalSourceAdapterRegistry,
  type SourceAdapterRegistryProviderProps,
} from "./SourceAdapterRegistryProvider";

export type {
  Page,
  SourceAdapter,
  SourceQuery,
  ValidationIssue,
  ValidationResult,
} from "./types";
