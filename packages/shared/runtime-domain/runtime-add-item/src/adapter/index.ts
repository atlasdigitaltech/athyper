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
} from "./source-adapter-registry-provider";

export type {
  Page,
  SourceAdapter,
  SourceQuery,
  ValidationIssue,
  ValidationResult,
} from "./types";
