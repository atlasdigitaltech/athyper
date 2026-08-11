import type { PlaneKey } from "@athyper/server-foundation/context";

export type JwtClaims = Readonly<Record<string, unknown>>;

export interface VerifiedToken {
  readonly claims: JwtClaims;
  readonly issuer: string;
  readonly subject: string;
  readonly audience: readonly string[];
  readonly issuedAt?: number;
  readonly expiresAt?: number;
}

export interface VerifiedIdentity {
  readonly planeKey: PlaneKey;
  readonly realmKey: string;
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
  readonly organizationId?: string;
  readonly companyCodeId?: string;
  readonly legalEntityId?: string;
}
