/**
 * @athyper/api-contracts — `/me/*` Schemas
 *
 * Shapes for principal-centric runtime endpoints exposed under /api/me/*.
 * All three planes (neon, mesh, admin) consume these via @athyper/bff-relay.
 *
 *   GET /api/me/profile          → MeProfile
 *   GET /api/me/identity         → MeIdentity
 *   GET /api/me/preferences      → MePreferences
 *   PATCH /api/me/preferences    → { ok: boolean; reason?: string }
 *   GET /api/me/tenant-context   → MeTenantContext
 *
 * Plus the admin-gated companion under /api/admin/tenant:
 *   GET /api/admin/tenant        → AdminTenant
 */
import { z } from "zod";
import { UuidSchema } from "./common";

// ── Profile ─────────────────────────────────────────────────────

export const MePrincipalSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  login_email: z.string().nullable(),
  principal_type: z.string(),
  principal_source: z.string(),
  created_at: z.string().datetime().nullable(),
});

export type MePrincipal = z.infer<typeof MePrincipalSchema>;

export const MePrincipalProfileSchema = z.object({
  given_name: z.string().nullable(),
  family_name: z.string().nullable(),
  preferred_name: z.string().nullable(),
  display_name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  default_company_code_id: UuidSchema.nullable(),
  default_cost_center_id: UuidSchema.nullable(),
  employee_id: UuidSchema.nullable(),
  enabled_date: z.string().datetime().nullable(),
  disabled_date: z.string().datetime().nullable(),
  updated_at: z.string().datetime().nullable(),
});

export type MePrincipalProfile = z.infer<typeof MePrincipalProfileSchema>;

export const MeAuthBindingSchema = z.object({
  realm_key: z.string(),
  provider_code: z.string(),
  username: z.string().nullable(),
  sync_status: z.string().nullable(),
  synced_at: z.string().datetime().nullable(),
  idp_enabled: z.boolean().nullable(),
  idp_email_verified: z.boolean().nullable(),
  required_actions: z.array(z.string()).nullable(),
});

export type MeAuthBinding = z.infer<typeof MeAuthBindingSchema>;

export const MeProfileSchema = z.object({
  principal: MePrincipalSchema.nullable(),
  profile: MePrincipalProfileSchema.nullable(),
  auth_bindings: z.array(MeAuthBindingSchema),
});

export type MeProfile = z.infer<typeof MeProfileSchema>;

// ── Identity ────────────────────────────────────────────────────

export const MeIdentityGroupRoleSchema = z.object({
  role_code: z.string(),
  role_name: z.string(),
  visibility_scope: z.string().nullable(),
  assignment_scope_type: z.string().nullable(),
  assignment_scope_ref_id: z.string().nullable(),
});

export type MeIdentityGroupRole = z.infer<typeof MeIdentityGroupRoleSchema>;

export const MeIdentityGroupSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  is_system: z.boolean().nullable(),
  status: z.string().nullable(),
  roles: z.array(MeIdentityGroupRoleSchema),
});

export type MeIdentityGroup = z.infer<typeof MeIdentityGroupSchema>;

export const MeIdentityTeamSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  team_type: z.string().nullable(),
  role_in_team: z.string().nullable(),
  joined_at: z.string().datetime().nullable(),
});

export type MeIdentityTeam = z.infer<typeof MeIdentityTeamSchema>;

export const MeIdentityDelegationSchema = z.object({
  id: UuidSchema,
  delegator_id: UuidSchema.nullable().optional(),
  delegator_name: z.string().nullable().optional(),
  delegate_id: UuidSchema.nullable().optional(),
  delegate_name: z.string().nullable().optional(),
  scope_type: z.string(),
  scope_ref: z.string().nullable(),
  permissions: z.array(z.string()),
  reason: z.string().nullable(),
  expires_at: z.string().datetime(),
  is_revoked: z.boolean(),
  created_at: z.string().datetime().nullable(),
});

export type MeIdentityDelegation = z.infer<typeof MeIdentityDelegationSchema>;

export const MeIdentityAccessibleCompanySchema = z.object({
  company_code: z.string(),
  company_name: z.string(),
  legal_entity_code: z.string().nullable(),
  legal_entity_name: z.string().nullable(),
});

export type MeIdentityAccessibleCompany = z.infer<typeof MeIdentityAccessibleCompanySchema>;

export const MeIdentitySchema = z.object({
  groups: z.array(MeIdentityGroupSchema),
  teams: z.array(MeIdentityTeamSchema),
  delegations_received: z.array(MeIdentityDelegationSchema),
  delegations_given: z.array(MeIdentityDelegationSchema),
  accessible_companies: z.array(MeIdentityAccessibleCompanySchema),
});

export type MeIdentity = z.infer<typeof MeIdentitySchema>;

// ── Preferences ─────────────────────────────────────────────────

export const AppearanceModeSchema = z.enum(["light", "dark", "system"]);
export type AppearanceMode = z.infer<typeof AppearanceModeSchema>;

// Density values must match server/db/seed/platform/000_lookups/LookupDomain/master/ui_density.sql
// (the runtime lookup domain). Keep this enum in sync with that seed file.
export const DensityCodeSchema = z.enum(["comfortable", "compact", "spacious"]);
export type DensityCode = z.infer<typeof DensityCodeSchema>;

export const MePreferencesSchema = z.object({
  appearance_mode: AppearanceModeSchema.nullable(),
  density_code: DensityCodeSchema.nullable(),
  theme_preset: z.string().nullable(),
  notification_digest: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  locale_code: z.string().nullable(),
  language_code: z.string().nullable(),
  timezone_code: z.string().nullable(),
  date_format: z.string().nullable(),
  number_format: z.string().nullable(),
  week_start: z.number().int().nullable(),
  home_workspace_code: z.string().nullable(),
  home_module_code: z.string().nullable(),
  default_company_code_id: UuidSchema.nullable(),
});

export type MePreferences = z.infer<typeof MePreferencesSchema>;

export const MePreferencesPatchSchema = MePreferencesSchema.partial().extend({
  // PATCH allows nullable explicit-null clears; same shape as GET.
});

export type MePreferencesPatch = z.infer<typeof MePreferencesPatchSchema>;

export const MePreferencesPatchResponseSchema = z.object({
  ok: z.boolean(),
  reason: z.string().optional(),
});

export type MePreferencesPatchResponse = z.infer<typeof MePreferencesPatchResponseSchema>;

// ── Saved Views ─────────────────────────────────────────────────
//
// Principal-centric projection of master.saved_view used by the Preferences
// section's Saved Views card. The /api/platform/saved-views/:entity endpoint
// returns a richer shape (config: EntityListQueryState) — that's the editor
// surface. This one is the manage surface (pin/star/share/archive).

export const MeSavedViewActionSchema = z.enum(["pin", "star", "share", "archive", "delete"]);
export type MeSavedViewAction = z.infer<typeof MeSavedViewActionSchema>;

export const SavedViewCapabilitiesSchema = z.object({
  canOpen: z.boolean(),
  canEdit: z.boolean(),
  canSetDefault: z.boolean(),
  canPin: z.boolean(),
  canShare: z.boolean(),
  canArchive: z.boolean(),
  canDelete: z.boolean(),
  canCloneToPersonal: z.boolean().default(false),
});
export type SavedViewCapabilities = z.infer<typeof SavedViewCapabilitiesSchema>;

export const SavedViewTargetSchema = z.object({
  plane: z.enum(["admin", "neon", "mesh"]),
  surface: z.string().min(1),
  entityCode: z.string().min(1).optional(),
  routeName: z.string().min(1).optional(),
  parameters: z.record(z.string(), z.string()).optional(),
});
export type SavedViewTarget = z.infer<typeof SavedViewTargetSchema>;

export const MeSavedViewSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  description: z.string().nullable(),
  /** Surface code (e.g. `entity.list`) — what UI the view applies to. */
  view_type: z.string(),
  /** Entity key (e.g. `journal_entry`) — what entity the view filters. */
  module_code: z.string(),
  is_pinned: z.boolean(),
  is_starred: z.boolean(),
  is_shared: z.boolean(),
  is_archived: z.boolean(),
  scope: z.enum(["personal", "shared", "system"]),
  owner_principal_id: UuidSchema.nullable(),
  plane_key: z.enum(["admin", "neon", "mesh"]),
  target: SavedViewTargetSchema,
  capabilities: SavedViewCapabilitiesSchema,
  created_at: z.string().datetime(),
  updated_at: z.string().datetime().nullable(),
});

export type MeSavedView = z.infer<typeof MeSavedViewSchema>;

export const SettingsScopeKindSchema = z.enum([
  "platform",
  "tenant",
  "organization",
  "company",
  "purchasing-org",
  "network-account",
  "personal",
]);
export type SettingsScopeKind = z.infer<typeof SettingsScopeKindSchema>;

export const SettingsScopeRefSchema = z.object({
  kind: SettingsScopeKindSchema,
  id: z.string().min(1),
  label: z.string().min(1).optional(),
});
export type SettingsScopeRef = z.infer<typeof SettingsScopeRefSchema>;

export const EffectiveSettingSchema = z.object({
  key: z.string().min(1),
  effectiveValue: z.unknown(),
  sourceScope: SettingsScopeRefSchema,
  editableScope: SettingsScopeRefSchema.optional(),
  inherited: z.boolean(),
  overrideAllowed: z.boolean(),
  requiredPermission: z.string().optional(),
  version: z.string().min(1),
  updatedAt: z.string().datetime().optional(),
  updatedBy: z.string().optional(),
  sensitive: z.boolean().default(false),
});
export type EffectiveSetting<T = unknown> = Omit<z.infer<typeof EffectiveSettingSchema>, "effectiveValue"> & {
  effectiveValue: T;
};

export const EffectiveSettingsResponseSchema = z.object({
  scope: SettingsScopeRefSchema,
  etag: z.string().min(1),
  settings: z.array(EffectiveSettingSchema),
  historyHref: z.string().optional(),
});
export type EffectiveSettingsResponse = z.infer<typeof EffectiveSettingsResponseSchema>;

// ── Tenant Context ──────────────────────────────────────────────

export const MeTenantActiveSchema = z.object({
  tenant_id: UuidSchema,
  code: z.string(),
  name: z.string(),
  realm_key: z.string(),
  workbench: z.string().nullable(),
});

export type MeTenantActive = z.infer<typeof MeTenantActiveSchema>;

export const MeTenantMembershipSchema = z.object({
  tenant_id: UuidSchema,
  code: z.string(),
  name: z.string(),
  realm_key: z.string(),
  is_active: z.boolean(),
});

export type MeTenantMembership = z.infer<typeof MeTenantMembershipSchema>;

export const MeTenantContextSchema = z.object({
  active: MeTenantActiveSchema.nullable(),
  memberships: z.array(MeTenantMembershipSchema),
  enabled_modules: z.array(z.string()),
});

export type MeTenantContext = z.infer<typeof MeTenantContextSchema>;

// ── Admin: Tenant (admin-gated companion, not under /me/*) ──────

export const AdminTenantInfoSchema = z.object({
  id: UuidSchema,
  code: z.string(),
  name: z.string(),
  display_name: z.string().nullable(),
  realm_key: z.string(),
  region: z.string().nullable(),
  subscription: z.string().nullable(),
  status: z.string().nullable(),
});

export type AdminTenantInfo = z.infer<typeof AdminTenantInfoSchema>;

export const AdminTenantProfileSchema = z.object({
  country_code: z.string().nullable(),
  currency_code: z.string().nullable(),
  locale_code: z.string().nullable(),
  timezone_code: z.string().nullable(),
  fiscal_year_start_month: z.number().int().nullable(),
  date_format: z.string().nullable(),
  number_format: z.string().nullable(),
  week_start: z.number().int().nullable(),
  language_code: z.string().nullable(),
  reporting_currency_code: z.string().nullable(),
});

export type AdminTenantProfile = z.infer<typeof AdminTenantProfileSchema>;

export const AdminTenantModuleSchema = z.object({
  module_code: z.string(),
  module_name: z.string(),
  status: z.string(),
  subscribed_at: z.string().datetime().nullable(),
});

export type AdminTenantModule = z.infer<typeof AdminTenantModuleSchema>;

export const AdminTenantFeatureSchema = z.object({
  feature_id: z.string(),
  status: z.string(),
  expires_at: z.string().datetime().nullable(),
  activated_at: z.string().datetime().nullable(),
});

export type AdminTenantFeature = z.infer<typeof AdminTenantFeatureSchema>;

export const AdminTenantPermissionOverrideSchema = z.object({
  permission_id: z.string(),
  is_granted: z.boolean(),
  reason: z.string().nullable(),
  expires_at: z.string().datetime().nullable(),
  granted_by: UuidSchema.nullable(),
});

export type AdminTenantPermissionOverride = z.infer<typeof AdminTenantPermissionOverrideSchema>;

export const AdminTenantSchema = z.object({
  tenant: AdminTenantInfoSchema.nullable(),
  tenant_profile: AdminTenantProfileSchema.nullable(),
  modules: z.array(AdminTenantModuleSchema),
  features: z.array(AdminTenantFeatureSchema),
  permission_overrides: z.array(AdminTenantPermissionOverrideSchema),
});

export type AdminTenant = z.infer<typeof AdminTenantSchema>;
