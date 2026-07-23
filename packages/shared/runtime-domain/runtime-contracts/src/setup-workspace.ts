/**
 * Serializable contract for workspace-level setup experiences.
 *
 * A setup workspace composes configuration from product modules. It is not a
 * module itself and must not expose module codes in its public route shape.
 */

export type SetupScopeType =
  | "platform"
  | "tenant"
  | "legal_entity"
  | "company_code"
  | "company_book"
  | "site"
  | "warehouse";

export type SetupScopeSelectionMode =
  | "automatic_single"
  | "explicit"
  | "fixed";

export type SetupStatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "critical";

export type SetupDomainState =
  | "not_applicable"
  | "not_started"
  | "in_progress"
  | "blocked"
  | "ready";

export interface SetupScopePolicyContract {
  type: SetupScopeType;
  routeSegment: string;
  selectionMode: SetupScopeSelectionMode;
  required: boolean;
}

export interface SetupSectionContract {
  code: string;
  routeSegment: string;
  label: string;
  description?: string;
  order: number;
  permission?: string;
}

export interface SetupDomainContract {
  code: string;
  routeSegment: string;
  label: string;
  description: string;
  iconKey: string;
  order: number;
  ownerModuleCode: string;
  contributingModuleCodes: readonly string[];
  requiredModuleCodes: readonly string[];
  requiredPermissions: readonly string[];
  supportedScopeTypes: readonly SetupScopeType[];
  sections?: readonly SetupSectionContract[];
  anchor?: string;
}

export interface SetupOverviewContract {
  title: string;
  description?: string;
  layout: "cards" | "journey" | "grouped";
  showDomainProgress: boolean;
  showAttention: boolean;
  showRecentActivity?: boolean;
  certificationEnabled: boolean;
}

export interface SetupWorkspaceCapabilities {
  readiness: boolean;
  certification: boolean;
  issues: boolean;
  activity: boolean;
  search: boolean;
  export: boolean;
}

export interface SetupWorkspaceContract {
  schemaVersion: "1.0";
  code: string;
  workspaceCode: string;
  workspaceSlug: string;
  label: string;
  description?: string;
  basePath: string;
  contributingModuleCodes: readonly string[];
  scopePolicies: readonly SetupScopePolicyContract[];
  domains: readonly SetupDomainContract[];
  overview: SetupOverviewContract;
  capabilities: SetupWorkspaceCapabilities;
}

export interface ResolvedSetupScope {
  type: SetupScopeType;
  code: string;
  id?: string;
  label: string;
}

export function setupScopePath(
  contract: SetupWorkspaceContract,
  scope: Pick<ResolvedSetupScope, "type" | "code">,
): string {
  const policy = contract.scopePolicies.find((candidate) => candidate.type === scope.type);
  if (!policy) throw new Error(`Unsupported setup scope type: ${scope.type}`);
  return `${contract.basePath}/${policy.routeSegment}/${encodeURIComponent(scope.code)}`;
}

export function setupDomainPath(
  contract: SetupWorkspaceContract,
  scope: Pick<ResolvedSetupScope, "type" | "code">,
  domain: SetupDomainContract,
): string {
  const root = setupScopePath(contract, scope);
  return domain.anchor ? `${root}#${domain.anchor}` : `${root}/${domain.routeSegment}`;
}

export function setupSectionPath(
  contract: SetupWorkspaceContract,
  scope: Pick<ResolvedSetupScope, "type" | "code">,
  domain: SetupDomainContract,
  section: SetupSectionContract,
): string {
  return `${setupScopePath(contract, scope)}/${domain.routeSegment}/${section.routeSegment}`;
}
