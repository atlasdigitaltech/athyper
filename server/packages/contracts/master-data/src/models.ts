import type { VerifiedRequestContext } from "@athyper/server-contract-auth";

export type ContactChannel = "email" | "phone" | "fax" | "sms" | "whatsapp" | "website";
export type MasterDataStatus = "active" | "inactive" | "deprecated";

export interface OwnerCoordinate {
  readonly entityCode: string;
  readonly ownerTypeId: string;
  readonly ownerId: string;
}

export interface SignedProviderEvidence {
  readonly provider: string;
  readonly evidenceId: string;
  readonly issuedAt: string;
  readonly expiresAt?: string;
  readonly payloadHash: string;
  readonly signature: string;
  readonly keyId: string;
}

export interface ContactLink {
  readonly id: string;
  readonly tenantId: string;
  readonly owner: OwnerCoordinate;
  readonly channelType: ContactChannel;
  readonly value: string;
  readonly purpose: string;
  readonly roleQualifier?: string;
  readonly isPrimary: boolean;
  readonly isVerified: boolean;
  readonly verifiedAt?: string;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly status: MasterDataStatus;
}

export interface AddressValue {
  readonly addressType?: string;
  readonly line1?: string;
  readonly line2?: string;
  readonly line3?: string;
  readonly city?: string;
  readonly region?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

export interface AddressLink {
  readonly id: string;
  readonly tenantId: string;
  readonly addressId: string;
  readonly owner: OwnerCoordinate;
  readonly address: AddressValue;
  readonly purpose: string;
  readonly roleQualifier?: string;
  readonly attentionLine?: string;
  readonly isPrimary: boolean;
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
}

export interface CreateContactCommand {
  readonly context: VerifiedRequestContext;
  readonly owner: OwnerCoordinate;
  readonly channelType: ContactChannel;
  readonly value: string;
  readonly purpose?: string;
  readonly roleQualifier?: string;
  readonly isPrimary?: boolean;
  readonly effectiveFrom?: string;
}

export interface CreateAddressCommand {
  readonly context: VerifiedRequestContext;
  readonly owner: OwnerCoordinate;
  readonly address: AddressValue;
  readonly purpose?: string;
  readonly roleQualifier?: string;
  readonly attentionLine?: string;
  readonly isPrimary?: boolean;
  readonly effectiveFrom?: string;
}

export interface ChangeVerificationCommand {
  readonly context: VerifiedRequestContext;
  readonly contactId: string;
  readonly verified: boolean;
  readonly evidence: SignedProviderEvidence;
}

export interface OwnerProfileQuery {
  readonly context: VerifiedRequestContext;
  readonly owner: OwnerCoordinate;
  readonly asOf?: string;
}

export interface OwnerAddressContactProfile {
  readonly owner: OwnerCoordinate;
  readonly contacts: readonly ContactLink[];
  readonly addresses: readonly AddressLink[];
}
