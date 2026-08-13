import type { PlaneKey } from "@athyper/server-foundation/context";

export interface ExperienceProfile {
  readonly localeCode: string;
  readonly languageCode: string;
  readonly timezoneCode: string;
  readonly dateFormat: string;
  readonly numberFormat: string;
  readonly weekStart: number;
  readonly weekendDays: readonly number[];
  readonly appearanceMode: "system" | "light" | "dark" | "high_contrast";
  readonly densityCode: "comfortable" | "compact";
}

export interface ExperienceModule {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly primary: boolean;
}

export interface ExperienceWorkspace {
  readonly code: string;
  readonly name: string;
  readonly iconKey?: string;
  readonly sortOrder: number;
  readonly modules: readonly ExperienceModule[];
}

export interface EffectiveFeature {
  readonly code: string;
  readonly enabled: boolean;
  readonly source: "catalog_default" | "rollout" | "tenant_override" | "kill_switch" | "version_constraint";
}

export interface ExperienceBootstrap {
  readonly schemaVersion: 1;
  readonly state: "ready" | "context_not_ready";
  readonly planeKey: PlaneKey;
  readonly tenantId: string;
  readonly principalId: string;
  readonly revision: string;
  readonly profile: ExperienceProfile;
  readonly workspaces: readonly ExperienceWorkspace[];
  readonly permissions: readonly string[];
  readonly features: Readonly<Record<string, EffectiveFeature>>;
  readonly nextActions: readonly ("select_context" | "retry_later")[];
}

export const experienceBootstrapSchema = {
  $id: "https://schemas.athyper.dev/platform/experience-bootstrap.v1.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "state", "planeKey", "tenantId", "principalId", "revision", "profile", "workspaces", "permissions", "features", "nextActions"],
  properties: {
    schemaVersion: { const: 1 },
    state: { enum: ["ready", "context_not_ready"] },
    planeKey: { enum: ["studio", "neon", "mesh"] },
    tenantId: { type: "string", format: "uuid" },
    principalId: { type: "string", format: "uuid" },
    revision: { type: "string", minLength: 16, maxLength: 128 },
    profile: {
      type: "object", additionalProperties: false,
      required: ["localeCode", "languageCode", "timezoneCode", "dateFormat", "numberFormat", "weekStart", "weekendDays", "appearanceMode", "densityCode"],
      properties: {
        localeCode: { type: "string" }, languageCode: { type: "string" }, timezoneCode: { type: "string" },
        dateFormat: { type: "string" }, numberFormat: { type: "string" }, weekStart: { type: "integer", minimum: 0, maximum: 6 },
        weekendDays: { type: "array", uniqueItems: true, items: { type: "integer", minimum: 0, maximum: 6 } },
        appearanceMode: { enum: ["system", "light", "dark", "high_contrast"] }, densityCode: { enum: ["comfortable", "compact"] },
      },
    },
    workspaces: { type: "array", items: { $ref: "#/$defs/workspace" } },
    permissions: { type: "array", uniqueItems: true, items: { type: "string" } },
    features: { type: "object", additionalProperties: { $ref: "#/$defs/feature" } },
    nextActions: { type: "array", uniqueItems: true, items: { enum: ["select_context", "retry_later"] } },
  },
  $defs: {
    module: { type: "object", additionalProperties: false, required: ["code", "name", "sortOrder", "primary"], properties: { code: { type: "string" }, name: { type: "string" }, iconKey: { type: "string" }, sortOrder: { type: "integer" }, primary: { type: "boolean" } } },
    workspace: { type: "object", additionalProperties: false, required: ["code", "name", "sortOrder", "modules"], properties: { code: { type: "string" }, name: { type: "string" }, iconKey: { type: "string" }, sortOrder: { type: "integer" }, modules: { type: "array", items: { $ref: "#/$defs/module" } } } },
    feature: { type: "object", additionalProperties: false, required: ["code", "enabled", "source"], properties: { code: { type: "string" }, enabled: { type: "boolean" }, source: { enum: ["catalog_default", "rollout", "tenant_override", "kill_switch", "version_constraint"] } } },
  },
} as const;
