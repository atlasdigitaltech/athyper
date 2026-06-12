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
} from "./MeUIProvider";

// Section components — typed against @athyper/api-contracts/me
export { ProfileSection } from "./sections/ProfileSection";
export { IdentitySection, type IdentitySectionProps } from "./sections/IdentitySection";
export { PreferencesSection } from "./sections/PreferencesSection";
export { TenantContextSection } from "./sections/TenantContextSection";
export { TenantAdminSection, type TenantAdminSectionProps } from "./sections/TenantAdminSection";

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
export { StepUpDialog, type StepUpDialogProps } from "./delegations/StepUpDialog";
export { GrantDelegationDialog, type GrantDelegationDialogProps } from "./delegations/GrantDelegationDialog";
export { DelegationsMutationTab } from "./delegations/DelegationsMutationTab";

// Orchestrator
export {
  MeSettings,
  type MeSettingsProps,
  type MeSectionId,
  type MeAdminSectionId,
} from "./MeSettings";

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
