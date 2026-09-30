import type { PlaneTransactionCoordinator } from "@athyper/server-foundation/transaction";
import type {
  AddressLink,
  AddressValue,
  ContactChannel,
  ContactLink,
  CreateAddressCommand,
  CreateContactCommand,
  OwnerAddressContactProfile,
  OwnerCoordinate,
  OwnerProfileQuery,
  SignedProviderEvidence,
} from "./models.js";

export interface ContactsService {
  create(command: CreateContactCommand): Promise<ContactLink>;
  changeVerification(command: { readonly context: CreateContactCommand["context"]; readonly contactId: string; readonly verified: boolean; readonly evidence: SignedProviderEvidence }): Promise<ContactLink>;
  deactivate(command: { readonly context: CreateContactCommand["context"]; readonly contactId: string; readonly effectiveUntil?: string }): Promise<void>;
}

export interface AddressesService {
  create(command: CreateAddressCommand): Promise<AddressLink>;
  deactivate(command: { readonly context: CreateAddressCommand["context"]; readonly addressLinkId: string; readonly effectiveUntil?: string }): Promise<void>;
}

export interface OwnerProfileService {
  get(query: OwnerProfileQuery): Promise<OwnerAddressContactProfile>;
}

export interface MasterDataRepository<Transaction = unknown> {
  ownerExists(tenantId: string, owner: OwnerCoordinate, transaction: Transaction): Promise<boolean>;
  findContactDuplicate(input: { readonly tenantId: string; readonly owner: OwnerCoordinate; readonly channelType: ContactChannel; readonly value: string; readonly purpose: string; readonly roleQualifier?: string }, transaction: Transaction): Promise<ContactLink | null>;
  createContact(input: Omit<ContactLink, "id" | "tenantId" | "isVerified" | "verifiedAt" | "status"> & { readonly tenantId: string }, transaction: Transaction): Promise<ContactLink>;
  /** Lock the current contact until verification and its effects commit or roll back. */
  getContactForVerification(tenantId: string, contactId: string, transaction: Transaction): Promise<ContactLink | null>;
  /** Persist evidence atomically; reject previously accepted or older evidence within this transaction. */
  setContactVerification(tenantId: string, contactId: string, verified: boolean, verifiedAt: string, evidence: SignedProviderEvidence, transaction: Transaction): Promise<ContactLink | null>;
  deactivateContact(tenantId: string, contactId: string, effectiveUntil: string, transaction: Transaction): Promise<boolean>;
  findAddressDuplicate(tenantId: string, normalizedHash: string, transaction: Transaction): Promise<{ readonly id: string; readonly address: AddressValue } | null>;
  createAddress(tenantId: string, address: AddressValue, normalizedHash: string, transaction: Transaction): Promise<{ readonly id: string; readonly address: AddressValue }>;
  createAddressLink(input: Omit<AddressLink, "id" | "address">, transaction: Transaction): Promise<AddressLink>;
  /** false means missing; cancellation retains the original date interval for audit. */
  deactivateAddressLink(tenantId: string, addressLinkId: string, effectiveUntil: string, transaction: Transaction): Promise<false | "deactivated" | "cancelled">;
  listContacts(tenantId: string, owner: OwnerCoordinate, asOf: string, transaction: Transaction): Promise<readonly ContactLink[]>;
  listAddresses(tenantId: string, owner: OwnerCoordinate, asOf: string, transaction: Transaction): Promise<readonly AddressLink[]>;
}

export type MasterDataTransactionCoordinator<Transaction> = PlaneTransactionCoordinator<Transaction>;
