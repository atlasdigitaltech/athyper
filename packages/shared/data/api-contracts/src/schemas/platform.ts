/**
 * @athyper/api-contracts — Platform Schemas
 *
 * Shapes for platform-level APIs: tenant, session, module tree,
 * notifications, saved views, blueprints.
 */
import { z } from "zod";
import { UuidSchema } from "./common";

// ── Session ─────────────────────────────────────────────────────

export const SessionSchema = z.object({
  user_id: UuidSchema,
  tenant_id: UuidSchema,
  persona_code: z.string(),
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

export const NotificationSchema = z.object({
  id: UuidSchema,
  type: z.string(),
  title: z.string(),
  body: z.string().nullable(),
  entity_type: z.string().nullable(),
  entity_id: z.string().nullable(),
  action_url: z.string().nullable(),
  is_read: z.boolean(),
  created_at: z.string().datetime(),
});

export type Notification = z.infer<typeof NotificationSchema>;

// ── Saved Views ─────────────────────────────────────────────────

export const SavedViewSchema = z.object({
  id: UuidSchema,
  entity_code: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  is_shared: z.boolean(),
  config: z.object({
    columns: z.array(z.string()).optional(),
    sort_by: z.string().optional(),
    sort_order: z.enum(["asc", "desc"]).optional(),
    filters: z.array(z.object({
      field: z.string(),
      operator: z.string(),
      value: z.unknown(),
    })).optional(),
    page_size: z.number().int().optional(),
  }),
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
