import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { ExactPlaneRepositoryProvider } from "@athyper/server-foundation/transaction";

export interface ExperienceIdentityRecord {
  readonly tenantStatus: string;
  readonly tenantRealmKey: string;
  readonly subscriptionPlanId?: string;
  readonly tenantRevision: string;
  readonly principalStatus: string;
  readonly principalAuthEpoch: number;
  readonly principalRevision: string;
  readonly identityBindingActive: boolean;
  readonly membershipActive: boolean;
  readonly membershipRevision?: string;
}

export interface ExperienceProfileRecord {
  readonly tenant?: Readonly<Record<string, unknown>>;
  readonly principal?: Readonly<Record<string, unknown>>;
  readonly revision: string;
}

export interface ExperienceCatalogRecord {
  readonly planActive: boolean;
  readonly planRevision: string;
  readonly associations: readonly Readonly<{ workspaceCode: string; workspaceName: string; workspaceIconKey?: string; workspaceSortOrder: number; moduleId: string; moduleCode: string; moduleName: string; moduleIconKey?: string; moduleSortOrder: number; primary: boolean; revision: string }>[];
  readonly permissions: readonly Readonly<{ code: string; moduleId: string; revision: string }>[];
}

export interface ExperienceFeatureRecord {
  readonly id: string;
  readonly code: string;
  readonly moduleId?: string;
  readonly kind: "release_gate" | "kill_switch" | "experiment";
  readonly defaultEnabled: boolean;
  readonly rolloutPct?: number;
  readonly overrideEnabled?: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly revision: string;
}

export interface ExperiencePlaneRepository {
  readIdentity(context: VerifiedRequestContext, at: Date): Promise<ExperienceIdentityRecord | undefined>;
  readProfile(context: VerifiedRequestContext): Promise<ExperienceProfileRecord>;
  readCatalog(context: VerifiedRequestContext, subscriptionPlanId: string): Promise<ExperienceCatalogRecord | undefined>;
  readFeatures(context: VerifiedRequestContext, at: Date): Promise<readonly ExperienceFeatureRecord[]>;
}

export type ExperienceRepositoryProvider = ExactPlaneRepositoryProvider<ExperiencePlaneRepository>;

export type ExperienceInvalidationKind = "profile" | "catalog" | "plan" | "flag" | "membership" | "authorization";
export interface ExperienceCache {
  get(key: string): Promise<unknown> | unknown;
  set(key: string, value: unknown, tags: readonly string[]): Promise<void> | void;
  invalidate(tags: readonly string[]): Promise<void> | void;
}

export interface ExperienceInvalidationHooks {
  profileChanged(planeKey: string, tenantId: string, principalId?: string): Promise<void>;
  catalogChanged(planeKey: string): Promise<void>;
  planChanged(planeKey: string, tenantId?: string): Promise<void>;
  flagChanged(planeKey: string, tenantId?: string): Promise<void>;
  membershipChanged(planeKey: string, tenantId: string, principalId: string): Promise<void>;
  authorizationChanged(planeKey: string, tenantId: string, principalId: string): Promise<void>;
}
