import type { PlaneKey } from "@athyper/server-foundation/context";

export interface PrincipalNotificationAddresses {
  readonly email?: string;
  readonly phoneE164?: string;
}

export interface PrincipalNotificationAddressDirectory {
  find(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
  }): Promise<PrincipalNotificationAddresses>;
}

export interface WhatsAppConsent {
  readonly phoneE164: string;
  readonly status: "opted_in";
}

export interface WhatsAppConsentRepository {
  findOptedIn(input: {
    readonly tenantId: string;
    readonly principalId: string;
    readonly planeKey: PlaneKey;
  }): Promise<WhatsAppConsent | undefined>;
}
