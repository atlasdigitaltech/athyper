// Provider + types
export {
  MeUIProvider,
  useMeUI,
  type MeUIContextValue,
  type MeUIProviderProps,
  type MeUIBffFetch,
  type MeUIBffFetchOptions,
  type MeUISessionView,
  type MeUIThemeApplier,
  type MeUIThemePreferences,
} from "./me-ui-provider";

// Section components — typed against @athyper/api-contracts/me
export { ProfileSection } from "./sections/profile-section";
export { IdentitySection, type IdentitySectionProps } from "./sections/identity-section";
export { PreferencesSection } from "./sections/preferences-section";
export { TenantContextSection } from "./sections/tenant-context-section";
export { TenantAdminSection, type TenantAdminSectionProps } from "./sections/tenant-admin-section";
export { DiagnosticsSection } from "./sections/diagnostics-section";

// Navigation defaults table (used by PreferencesSection — exposed so future
// dynamic loaders can compose with it).
export {
  HOME_WORKSPACES,
  HOME_MODULES_BY_WS,
  type NavigationModuleOption,
  type NavigationWorkspaceOption,
} from "./preferences/navigation-defaults";

// Delegation mutation flow (opt-in via IdentitySection.enableDelegationMutations,
// or composed directly). Requires @tanstack/react-query in the host app.
export { StepUpDialog, type StepUpDialogProps } from "./delegations/step-up-dialog";
export { GrantDelegationDialog, type GrantDelegationDialogProps } from "./delegations/grant-delegation-dialog";
export { DelegationsMutationTab } from "./delegations/delegations-mutation-tab";

// Orchestrator
export {
  MeSettings,
  type MeSettingsProps,
  type MeSectionId,
  type MeAdminSectionId,
} from "./me-settings";

// Re-export shared UI helpers (so neon's existing _shared can re-export from here
// without duplicating implementations).
export {
  str,
  fmtDate,
  fmtDateTime,
  useSectionData,
  StatusBadge,
  SourceChip,
  ManagedBy,
  InfoRow,
  SectionCard,
  Banner,
  ToggleGroup,
  DataTable,
  SkeletonCard,
  ConfirmDialog,
  type ManagedByProps,
  type ConfirmDialogAction,
} from "./_shared";











