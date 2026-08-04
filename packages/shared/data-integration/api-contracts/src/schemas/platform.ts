/**
 * @athyper/api-contracts — Platform Schemas
 *
 * Shapes for platform-level APIs: tenant, session, module tree,
 * notifications, saved views, blueprints.
 */
import { z } from "zod";
import { UuidSchema } from "./common";
import { EntityListQueryStateSchema } from "./entity-list";

// ── Session ─────────────────────────────────────────────────────

export const SessionSchema = z.object({
  user_id: UuidSchema,
  tenant_id: UuidSchema,
  workbench: z.enum(["user", "partner", "admin"]),
  locale: z.string(),
  timezone: z.string(),
  /** All known permission codes mapped to boolean. false = not granted. */
  permissions: z.record(z.string(), z.boolean()),
});

export type Session = z.infer<typeof SessionSchema>;

// ── Module Tree (for navigation) ────────────────────────────────

export const ModuleNodeSchema = z.object({
  code: z.string(),
  name: z.string(),
  workspace: z.string(),
  icon: z.string().nullable(),
  entity_codes: z.array(z.string()),
  sort_order: z.number().int(),
  is_enabled: z.boolean(),
});

export type ModuleNode = z.infer<typeof ModuleNodeSchema>;

export const WorkspaceNodeSchema = z.object({
  key: z.string(),
  label: z.string(),
  sort_order: z.number().int(),
  modules: z.array(ModuleNodeSchema),
});

export type WorkspaceNode = z.infer<typeof WorkspaceNodeSchema>;

// ── Notifications ───────────────────────────────────────────────

export const PlaneKeySchema = z.enum(["neon", "mesh", "admin"]);
export type PlaneKey = z.infer<typeof PlaneKeySchema>;

export const NotificationSchema = z.object({
  id: UuidSchema,
  message_id: UuidSchema,
  plane_key: PlaneKeySchema,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  subject: z.string().nullable(),
  event_code: z.string(),
  payload: z.record(z.string(), z.unknown()),
  priority: z.string(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  action_url: z.string().nullable(),
  is_read: z.boolean(),
  read_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const NotificationChannelCapabilitySchema = z.object({
  code: z.string(),
  available: z.boolean(),
  reason: z.string().optional(),
});

export const NotificationPreferenceSchema = z.object({
  id: UuidSchema,
  event_code: z.string(),
  channel: z.string(),
  is_enabled: z.boolean().nullable(),
  frequency_code: z.string().nullable(),
  status: z.string().optional(),
});

export const NotificationCapabilitiesSchema = z.object({
  plane_key: PlaneKeySchema,
  channels: z.array(NotificationChannelCapabilitySchema),
  digest_frequencies: z.array(NotificationChannelCapabilitySchema),
  effective_preferences: z.array(NotificationPreferenceSchema),
});

export type NotificationCapabilities = z.infer<typeof NotificationCapabilitiesSchema>;

// ── Saved Views ─────────────────────────────────────────────────
//
// SavedView.config IS EntityListQueryState.
// One canonical shape: URL params ↔ store ↔ saved_view.state_json ↔ API.
// The server writes EntityListQueryState directly to state_json.
// The mapper passes state_json through as-is; no field extraction.

export const SavedViewSchema = z.object({
  id: UuidSchema,
  entity_code: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  is_shared: z.boolean(),
  /** Canonical list query state — same shape stored in URL params and Zustand store. */
  config: EntityListQueryStateSchema,
  created_by: UuidSchema,
  created_at: z.string().datetime(),
});

export type SavedView = z.infer<typeof SavedViewSchema>;

// ── Blueprint ───────────────────────────────────────────────────

export const BlueprintSchema = z.object({
  code: z.string(),
  name: z.string(),
  category: z.enum(["base", "industry_pack", "coa_framework", "default_rules"]),
  industry_vertical: z.array(z.string()).nullable(),
  framework: z.string().nullable(),
  description: z.string().nullable(),
  status: z.enum(["active", "deprecated", "applied"]),
  dependencies: z.array(z.string()).nullable(),
});

export type Blueprint = z.infer<typeof BlueprintSchema>;
