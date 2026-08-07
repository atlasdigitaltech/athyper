import { createHash } from "node:crypto";

import type {
  TenantIdpFeatureGate,
  TenantIdpProviderType,
} from "../providers/tenant-identity-provider.js";

export type PlaneKey = "neon" | "mesh" | "admin";

export interface DiscoveryQuery {
  planeKey: PlaneKey;
  identifier?: string;
  email?: string;
}

export interface DiscoveryCandidate {
  id: string;
  planeKey: PlaneKey;
  tenantId: string;
  tenantCode: string;
  tenantName: string;
  workspaceId: string;
  workspaceCode: string;
  workspaceName: string;
  workspaceType: string;
  workspaceSubtitle: string;
  realmKey: string;
  providerHint: string | null;
  authMethodLabel: string;
  hostname: string | null;
  deliveryEmail: string | null;
  principalDisplayName?: string | null;
  networkAccountId?: string | null;
  networkAccountCode?: string | null;
  networkAccountName?: string | null;
  networkAccountRole?: string | null;
  networkRelationshipType?: string | null;
  resolutionKind: "identity" | "verified-domain";
  providerType: TenantIdpProviderType;
  featureGate: TenantIdpFeatureGate;
}

export interface DiscoveryResponse {
  candidates: DiscoveryCandidate[];
  policy: DiscoveryPolicy;
}

export interface TenantDiscoveryService {
  discover(query: DiscoveryQuery): Promise<DiscoveryResponse>;
}

export interface KeycloakDiscoveryConfig {
  baseUrl: string;
  realm: string;
  getAdminToken(): Promise<string>;
}

export interface DiscoveryPolicy {
  stage1VerificationMode: "required" | "disabled";
  tokenTtlSeconds: number;
  resendCooldownSeconds: number;
  verifiedTrustTtlDays: number;
}

interface KeycloakUser {
  id?: string;
  username?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled?: boolean;
}

interface KeycloakOrganization {
  id?: string;
  alias?: string;
  name?: string;
  enabled?: boolean;
  domains?: Array<{ name?: string; verified?: boolean }>;
  attributes?: Record<string, string[] | string>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBTITLE: Record<PlaneKey, string> = {
  admin: "Admin organization",
  neon: "Neon organization",
  mesh: "Mesh organization",
};

export function createTenantDiscoveryService(
  keycloak: KeycloakDiscoveryConfig,
): TenantDiscoveryService {
  return {
    async discover(query): Promise<DiscoveryResponse> {
      const identifier = normalizeIdentifier(query.identifier ?? query.email);
      if (!identifier) return { candidates: [], policy: discoveryPolicy() };
      const token = await keycloak.getAdminToken();
      const users = await exactUsers(keycloak, token, identifier);
      const exactUser = users.length === 1 ? users[0] : undefined;
      const organizations = exactUser?.id
        ? await organizationsForMember(keycloak, token, exactUser.id)
        : await organizationsForVerifiedDomain(keycloak, token, identifier);
      const resolutionKind = exactUser ? "identity" as const : "verified-domain" as const;
      const hostname = identifier.includes("@") ? identifier.split("@")[1] ?? null : null;
      const candidates = organizations
        .filter((organization) => organization.enabled !== false && isUuid(organization.alias))
        .slice(0, 25)
        .map((organization): DiscoveryCandidate => {
          const tenantId = organization.alias!.toLowerCase();
          const name = organization.name?.trim() || tenantId;
          return {
            id: stableId(query.planeKey, keycloak.realm, tenantId),
            planeKey: query.planeKey,
            tenantId,
            tenantCode: tenantId,
            tenantName: name,
            workspaceId: tenantId,
            workspaceCode: tenantId,
            workspaceName: name,
            workspaceType: query.planeKey === "mesh" ? "network" : "tenant",
            workspaceSubtitle: SUBTITLE[query.planeKey],
            realmKey: keycloak.realm,
            providerHint: firstAttribute(organization.attributes?.identity_provider_alias) ?? null,
            authMethodLabel: "Organization sign-in",
            hostname,
            deliveryEmail: resolutionKind === "identity" ? exactUser?.email ?? null : identifier,
            principalDisplayName: resolutionKind === "identity" ? displayName(exactUser!) : null,
            resolutionKind,
            providerType: "generic",
            featureGate: "core",
          };
        });
      return { candidates, policy: discoveryPolicy() };
    },
  };
}

async function exactUsers(
  config: KeycloakDiscoveryConfig,
  token: string,
  identifier: string,
): Promise<KeycloakUser[]> {
  const parameter = identifier.includes("@") ? "email" : "username";
  const url = adminUrl(config, `/users?${parameter}=${encodeURIComponent(identifier)}&exact=true&max=2`);
  const users = await getJson<KeycloakUser[]>(url, token);
  return users.filter((user) => user.enabled !== false && (
    parameter === "email"
      ? user.email?.toLowerCase() === identifier
      : user.username?.toLowerCase() === identifier
  ));
}

async function organizationsForMember(
  config: KeycloakDiscoveryConfig,
  token: string,
  memberId: string,
): Promise<KeycloakOrganization[]> {
  return getJson<KeycloakOrganization[]>(
    adminUrl(config, `/organizations/members/${encodeURIComponent(memberId)}/organizations?briefRepresentation=false`),
    token,
  );
}

async function organizationsForVerifiedDomain(
  config: KeycloakDiscoveryConfig,
  token: string,
  identifier: string,
): Promise<KeycloakOrganization[]> {
  if (!identifier.includes("@")) return [];
  const domain = identifier.split("@")[1];
  if (!domain) return [];
  const organizations = await getJson<KeycloakOrganization[]>(
    adminUrl(config, `/organizations?search=${encodeURIComponent(domain)}&exact=true&briefRepresentation=false&max=25`),
    token,
  );
  return organizations.filter((organization) =>
    organization.domains?.some((entry) => entry.verified === true && entry.name?.toLowerCase() === domain),
  );
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw new Error(`KEYCLOAK_DISCOVERY_FAILED:${response.status}`);
  return response.json() as Promise<T>;
}

function adminUrl(config: KeycloakDiscoveryConfig, path: string): string {
  return `${config.baseUrl.replace(/\/+$/, "")}/admin/realms/${encodeURIComponent(config.realm)}${path}`;
}

function normalizeIdentifier(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const identifier = value.trim().toLowerCase();
  if (!identifier || /\s/.test(identifier) || identifier.length > 320) return null;
  if (/^[^@]+@[^@]+\.[^@]+$/.test(identifier)) return identifier;
  return /^[a-z0-9._-]{2,128}$/.test(identifier) ? identifier : null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function stableId(plane: PlaneKey, realm: string, tenantId: string): string {
  return createHash("sha256").update(`${plane}|${realm}|${tenantId}`).digest("hex").slice(0, 32);
}

function displayName(user: KeycloakUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ") || user.username || "";
}

function firstAttribute(value: string[] | string | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  return value?.find((entry) => entry.trim())?.trim();
}

function discoveryPolicy(): DiscoveryPolicy {
  return {
    stage1VerificationMode: "required",
    tokenTtlSeconds: 600,
    resendCooldownSeconds: 60,
    verifiedTrustTtlDays: 30,
  };
}
