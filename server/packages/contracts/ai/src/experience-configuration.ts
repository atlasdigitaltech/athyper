import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type AtlasExperiencePlane = VerifiedRequestContext["planeKey"];
export type AtlasWidgetKind = "recommendations" | "quick-actions" | "workspaces" | "recent";
export type AtlasSearchSourceKind = "navigation" | "record" | "knowledge";
export type AtlasAgentDataClass = "public" | "internal" | "confidential" | "restricted";

export interface AtlasExperienceAccess {
  readonly permissions?: readonly string[];
  readonly features?: readonly string[];
}

export interface AtlasWidgetConfiguration {
  readonly code: string;
  readonly kind: AtlasWidgetKind;
  readonly title: string;
  readonly enabled: boolean;
  readonly planes: readonly AtlasExperiencePlane[];
  readonly order: number;
  readonly access?: AtlasExperienceAccess;
}

export interface AtlasSearchSourceConfiguration {
  readonly code: string;
  readonly kind: AtlasSearchSourceKind;
  readonly label: string;
  readonly enabled: boolean;
  readonly planes: readonly AtlasExperiencePlane[];
  readonly permissionCode?: string;
  readonly entityCode?: string;
  readonly routePrefix?: string;
}

export interface AtlasPromptConfiguration {
  readonly code: string;
  readonly label: string;
  readonly prompt: string;
  readonly enabled: boolean;
  readonly planes: readonly AtlasExperiencePlane[];
  readonly agentCode: string;
  readonly access?: AtlasExperienceAccess;
}

export interface AtlasAgentConfiguration {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly planes: readonly AtlasExperiencePlane[];
  readonly publicModelId: string;
  readonly dataClass: AtlasAgentDataClass;
  readonly promptRevision: string;
  readonly toolCodes: readonly string[];
  readonly access?: AtlasExperienceAccess;
}

export interface AtlasExperienceDefinition {
  readonly schema: "atlas-experience-definition/1";
  readonly scope: string;
  readonly widgets: readonly AtlasWidgetConfiguration[];
  readonly searchSources: readonly AtlasSearchSourceConfiguration[];
  readonly prompts: readonly AtlasPromptConfiguration[];
  readonly agents: readonly AtlasAgentConfiguration[];
}

export interface AtlasExperienceRelease {
  readonly releaseId: string;
  readonly tenantId: string;
  readonly revision: number;
  readonly status: "draft" | "published" | "retired";
  readonly definition: AtlasExperienceDefinition;
  readonly contentHash: string;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly publishedAt?: string;
  readonly publishedBy?: string;
}

/** Permission-filtered, plane-local projection. Authoring metadata is deliberately omitted. */
export interface AtlasExperienceProjection {
  readonly schema: "atlas-experience-projection/1";
  readonly scope: string;
  readonly revision: number;
  readonly contentHash: string;
  readonly widgets: readonly AtlasWidgetConfiguration[];
  readonly searchSources: readonly AtlasSearchSourceConfiguration[];
  readonly prompts: readonly AtlasPromptConfiguration[];
  readonly agents: readonly AtlasAgentConfiguration[];
}

export interface AtlasExperienceConfigurationRepository {
  getDraft(input: { readonly context: VerifiedRequestContext; readonly scope: string }): Promise<AtlasExperienceRelease | null>;
  getPublished(input: { readonly context: VerifiedRequestContext; readonly scope: string }): Promise<AtlasExperienceRelease | null>;
  saveDraft(input: { readonly context: VerifiedRequestContext; readonly definition: AtlasExperienceDefinition; readonly expectedRevision?: number }): Promise<AtlasExperienceRelease>;
  publish(input: { readonly context: VerifiedRequestContext; readonly scope: string; readonly expectedRevision: number }): Promise<AtlasExperienceRelease>;
}
