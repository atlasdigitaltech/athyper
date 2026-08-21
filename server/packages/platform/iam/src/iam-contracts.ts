import type { PlaneKey } from "@athyper/server-foundation/context";

export const IAM_PLANES = Object.freeze(["studio", "neon", "mesh"] as const);
export type IamPlane = (typeof IAM_PLANES)[number];

export interface PlaneIdentityContract {
  readonly planeKey: IamPlane;
  readonly clientId: `${IamPlane}-web`;
  readonly audience: string;
  readonly issuer: string;
}

export type IamAuthority = "keycloak" | "studio-trustiam" | "plane-postgresql" | "redis";

export const IAM_AUTHORITY = Object.freeze({
  credentials: "keycloak",
  providerSession: "keycloak",
  desiredOrganizations: "studio-trustiam",
  desiredApplicationProjections: "studio-trustiam",
  principals: "plane-postgresql",
  memberships: "plane-postgresql",
  groups: "plane-postgresql",
  delegations: "plane-postgresql",
  bffSessions: "redis",
  elevation: "redis",
} as const satisfies Readonly<Record<string, IamAuthority>>);

export function isIamPlane(value: string): value is IamPlane {
  return (IAM_PLANES as readonly string[]).includes(value);
}

export function assertIamPlane(value: PlaneKey | string): asserts value is IamPlane {
  if (!isIamPlane(value)) throw new TypeError(`Unsupported IAM plane: ${value}`);
}

export function createPlaneIdentityContracts(
  input: Readonly<Record<IamPlane, { readonly issuer: string; readonly audience: string }>>,
): Readonly<Record<IamPlane, PlaneIdentityContract>> {
  return Object.freeze(Object.fromEntries(IAM_PLANES.map((planeKey) => {
    const issuer = input[planeKey].issuer.trim().replace(/\/+$/, "");
    const audience = input[planeKey].audience.trim();
    if (!issuer || !audience) throw new TypeError(`Issuer and audience are required for ${planeKey}`);
    return [planeKey, Object.freeze({ planeKey, clientId: `${planeKey}-web`, issuer, audience })];
  }))) as unknown as Readonly<Record<IamPlane, PlaneIdentityContract>>;
}
