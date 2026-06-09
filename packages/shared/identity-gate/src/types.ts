import type {
  PlaneKey,
  RealmKey,
  SessionNamespace,
} from "@athyper/session-plane";

export interface OrgMembership {
  id: string;
  name: string;
  alias: string;
  roles: string[];
  tenantId?: string;
  tenantCode?: string;
  tenantName?: string;
  contextType?: string;
  workspaceId?: string;
  workspaceCode?: string;
  workspaceType?: string;
  organizationId?: string;
  organizationCode?: string;
  organizationName?: string;
  legalEntityId?: string;
  legalEntityCode?: string;
  legalEntityName?: string;
  keycloakOrganizationId?: string;
  keycloakOrganizationAlias?: string;
}

export interface PublicSession {
  authenticated: true;
  planeKey: PlaneKey;
  realmKey: RealmKey;
  sessionNamespace: SessionNamespace;
  supportMode: boolean;
  userId: string;
  username: string;
  displayName: string;
  email?: string;
  organizations: Record<string, OrgMembership>;
  activeOrg: string | null;
  activeWorkbench: string | null;
  accessExpiresAt: number;
  mfaRequired: boolean;
  mfaVerified: boolean;
}

export interface LastContext {
  org: string;
  workbench: string;
}

export interface BrowserLocationSnapshot {
  pathname: string;
  search: string;
}

export type AuthLayoutVariant = "brand" | "compact";
