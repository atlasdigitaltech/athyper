import type { MasterDataAccessAuthorizer, MasterDataAccess, MasterDataAuthorityTarget } from "./master-data-authority.js";
import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type {
  AddressesService,
  ContactsService,
  MasterDataRepository,
  MasterDataTransactionCoordinator,
  OwnerCoordinate,
  OwnerProfileService,
  SignedProviderEvidence,
} from "@athyper/server-contract-master-data";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import type { ProviderVerificationTarget } from "./provider-evidence-verifier.js";
import { optionalTimestamp } from "./validation.js";
import { MasterDataError } from "./errors.js";
import { normalizeAddress, normalizeContactValue, normalizeOptional, normalizePurpose } from "./normalization.js";

export interface ProviderEvidenceVerifier {
  /** Authenticate the complete evidence envelope against the trusted stored target, not its supplied hash alone. */
  verify(evidence: SignedProviderEvidence, target: ProviderVerificationTarget): Promise<boolean>;
}

export interface MasterDataServiceOptions<Transaction> {
  readonly metadata: MetadataReader;
  readonly authorizer: Authorizer;
  readonly repository: MasterDataRepository<Transaction>;
  readonly transactions: MasterDataTransactionCoordinator<Transaction>;
  readonly audit: AuditRecorder<Transaction>;
  readonly outbox: OutboxWriter<Transaction>;
  readonly evidenceVerifier: ProviderEvidenceVerifier;
  readonly now?: () => Date;
  readonly authorizeAccess?: MasterDataAccessAuthorizer<Transaction>;
  readonly authorizeVerification?: (context: VerifiedRequestContext, contactId: string, transaction: Transaction) => Promise<void>;
}

export interface MasterDataServices {
  readonly contacts: ContactsService;
  readonly addresses: AddressesService;
  readonly ownerProfile: OwnerProfileService;
}

export function createMasterDataServices<Transaction>(options: MasterDataServiceOptions<Transaction>): MasterDataServices {
  const now = () => (options.now?.() ?? new Date()).toISOString();
  return {
    contacts: {
      async create(command) {
        const value = normalizeContactValue(command.channelType, command.value);
        const purpose = normalizePurpose(command.purpose);
        const roleQualifier = normalizeOptional(command.roleQualifier);
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await authorizeAccess(options, command.context, "contact.write", { owner: command.owner }, transaction);
          await validateOwner(options, command.context, command.owner, transaction);
          const duplicate = await options.repository.findContactDuplicate({ tenantId: command.context.tenantId, owner: command.owner, channelType: command.channelType, value, purpose, ...(roleQualifier ? { roleQualifier } : {}) }, transaction);
          if (duplicate) throw new MasterDataError(409, "CONTACT_DUPLICATE", "An equivalent active contact already exists");
          const contact = await options.repository.createContact({ tenantId: command.context.tenantId, owner: command.owner, channelType: command.channelType, value, purpose, ...(roleQualifier ? { roleQualifier } : {}), isPrimary: command.isPrimary ?? false, effectiveFrom: optionalTimestamp(command.effectiveFrom) ?? now() }, transaction);
          await effects(options, command.context, transaction, "master.contact.created", "create", "contact", contact.id, { channelType: contact.channelType, purpose: contact.purpose });
          return contact;
        });
      },
      async changeVerification(command) {
        const verifiedAt = now();
        const issuedAt = optionalTimestamp(command.evidence.issuedAt);
        const expiresAt = optionalTimestamp(command.evidence.expiresAt);
        if (!issuedAt || Date.parse(issuedAt) > Date.parse(verifiedAt) || (expiresAt && (Date.parse(expiresAt) <= Date.parse(verifiedAt) || Date.parse(expiresAt) <= Date.parse(issuedAt)))) {
          throw new MasterDataError(422, "VERIFICATION_EVIDENCE_INVALID", "Provider evidence is not currently valid");
        }
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          if (options.authorizeVerification) await options.authorizeVerification(command.context, command.contactId, transaction);
          else throw new MasterDataError(503, "MASTER_DATA_AUTHORITY_UNAVAILABLE", "Contact verification authority is not configured");
          const current = await options.repository.getContactForVerification(command.context.tenantId, command.contactId, transaction);
          if (!current) throw new MasterDataError(404, "CONTACT_NOT_FOUND", "Contact was not found");
          // The repository holds this row lock through verification, mutation, and effects.
          const target: ProviderVerificationTarget = {
            planeKey: command.context.planeKey,
            tenantId: command.context.tenantId,
            contactId: current.id,
            channelType: current.channelType,
            value: current.value,
            verified: command.verified,
          };
          if (!await options.evidenceVerifier.verify(command.evidence, target)) {
            throw new MasterDataError(422, "VERIFICATION_EVIDENCE_INVALID", "Provider evidence is invalid for this contact and operation");
          }
          const contact = await options.repository.setContactVerification(command.context.tenantId, command.contactId, command.verified, verifiedAt, command.evidence, transaction);
          if (!contact) throw new MasterDataError(404, "CONTACT_NOT_FOUND", "Contact was not found");
          await effects(options, command.context, transaction, "master.contact.verification_changed", "verify", "contact", contact.id, { verified: command.verified, provider: command.evidence.provider, evidenceId: command.evidence.evidenceId });
          return contact;
        });
      },
      async deactivate(command) {
        await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await authorizeAccess(options, command.context, "contact.write", { contactId: command.contactId }, transaction);
          if (!await options.repository.deactivateContact(command.context.tenantId, command.contactId, optionalTimestamp(command.effectiveUntil) ?? now(), transaction)) throw new MasterDataError(404, "CONTACT_NOT_FOUND", "Contact was not found");
          await effects(options, command.context, transaction, "master.contact.deactivated", "deactivate", "contact", command.contactId);
        });
      },
    },
    addresses: {
      async create(command) {
        const normalized = normalizeAddress(command.address);
        const purpose = normalizePurpose(command.purpose);
        const roleQualifier = normalizeOptional(command.roleQualifier);
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await authorizeAccess(options, command.context, "address.write", { owner: command.owner }, transaction);
          await validateOwner(options, command.context, command.owner, transaction);
          const existing = await options.repository.findAddressDuplicate(command.context.tenantId, normalized.hash, transaction);
          const address = existing ?? await options.repository.createAddress(command.context.tenantId, normalized.address, normalized.hash, transaction);
          const link = await options.repository.createAddressLink({ tenantId: command.context.tenantId, addressId: address.id, owner: command.owner, purpose, ...(roleQualifier ? { roleQualifier } : {}), ...(normalizeOptional(command.attentionLine) ? { attentionLine: normalizeOptional(command.attentionLine) } : {}), isPrimary: command.isPrimary ?? false, effectiveFrom: optionalTimestamp(command.effectiveFrom) ?? now() }, transaction);
          await effects(options, command.context, transaction, "master.address.linked", "link", "address_link", link.id, { addressId: address.id, purpose, reusedAddress: Boolean(existing) });
          return link;
        });
      },
      async deactivate(command) {
        await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await authorizeAccess(options, command.context, "address.write", { addressLinkId: command.addressLinkId }, transaction);
          const disposition = await options.repository.deactivateAddressLink(command.context.tenantId, command.addressLinkId, optionalTimestamp(command.effectiveUntil) ?? now(), transaction);
          if (!disposition) throw new MasterDataError(404, "ADDRESS_LINK_NOT_FOUND", "Address link was not found");
          await effects(options, command.context, transaction, "master.address.deactivated", "deactivate", "address_link", command.addressLinkId, { disposition });
        });
      },
    },
    ownerProfile: {
      async get(query) {
        const asOf = optionalTimestamp(query.asOf) ?? now();
        return options.transactions.run(query.context.planeKey, actor(query.context), async (transaction) => {
          await authorizeAccess(options, query.context, "profile.read", { owner: query.owner }, transaction);
          await validateOwner(options, query.context, query.owner, transaction);
          const [contacts, addresses] = await Promise.all([
            options.repository.listContacts(query.context.tenantId, query.owner, asOf, transaction),
            options.repository.listAddresses(query.context.tenantId, query.owner, asOf, transaction),
          ]);
          return { owner: query.owner, contacts, addresses };
        });
      },
    },
  };
}

async function validateOwner<Transaction>(options: MasterDataServiceOptions<Transaction>, context: VerifiedRequestContext, owner: OwnerCoordinate, transaction: Transaction): Promise<void> {
  const descriptor = await options.metadata.getEntityDescriptor(context, owner.entityCode);
  if (!descriptor) throw new MasterDataError(422, "OWNER_ENTITY_NOT_PUBLISHED", "Owner entity is not active in Entity Metadata");
  if (!await options.repository.ownerExists(context.tenantId, owner, transaction)) throw new MasterDataError(404, "OWNER_NOT_FOUND", "Owner does not exist");
}

function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
async function effects<Transaction>(options: MasterDataServiceOptions<Transaction>, context: VerifiedRequestContext, transaction: Transaction, eventCode: string, action: string, entityType: string, entityId: string, metadata: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await options.outbox.append({ tenantId: context.tenantId, topic: "master-data", eventType: eventCode, entityType, entityId, actorId: context.principalId, correlationId: context.correlationId, payload: { entityType, entityId, ...metadata } }, transaction);
  await options.audit.record({ eventCode, action, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType, entityId, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata }, transaction);
}

/** Missing trusted scope resolution must never fall back to an unscoped permission check. */
async function authorizeAccess<T>(options: MasterDataServiceOptions<T>, context: VerifiedRequestContext, access: MasterDataAccess, target: MasterDataAuthorityTarget, tx: T) {
  if (!options.authorizeAccess) throw new MasterDataError(503, "MASTER_DATA_AUTHORITY_UNAVAILABLE", "Master-data authority is not configured");
  await options.authorizeAccess(context, access, target, tx);
}
