import type { AuditRecorder } from "@athyper/server-contract-audit";
import type { Authorizer, VerifiedRequestContext } from "@athyper/server-contract-auth";
import type { OutboxWriter } from "@athyper/server-contract-events";
import type {
  AddressesService,
  ContactLink,
  ContactsService,
  CreateAddressCommand,
  CreateContactCommand,
  MasterDataRepository,
  MasterDataTransactionCoordinator,
  OwnerCoordinate,
  OwnerProfileService,
  SignedProviderEvidence,
} from "@athyper/server-contract-master-data";
import type { MetadataReader } from "@athyper/server-contract-metadata";
import { MasterDataError } from "./errors.js";
import { normalizeAddress, normalizeContactValue, normalizeOptional, normalizePurpose } from "./normalization.js";

export interface ProviderEvidenceVerifier {
  verify(evidence: SignedProviderEvidence): Promise<boolean>;
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
        await requirePermission(options.authorizer, command.context, "master.contact.pii.write", { ...command.owner });
        const value = normalizeContactValue(command.channelType, command.value);
        const purpose = normalizePurpose(command.purpose);
        const roleQualifier = normalizeOptional(command.roleQualifier);
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await validateOwner(options, command.context, command.owner, transaction);
          const duplicate = await options.repository.findContactDuplicate({ tenantId: command.context.tenantId, owner: command.owner, channelType: command.channelType, value, purpose, ...(roleQualifier ? { roleQualifier } : {}) }, transaction);
          if (duplicate) throw new MasterDataError(409, "CONTACT_DUPLICATE", "An equivalent active contact already exists");
          const contact = await options.repository.createContact({ tenantId: command.context.tenantId, owner: command.owner, channelType: command.channelType, value, purpose, ...(roleQualifier ? { roleQualifier } : {}), isPrimary: command.isPrimary ?? false, effectiveFrom: command.effectiveFrom ?? now() }, transaction);
          await effects(options, command.context, transaction, "master.contact.created", "create", "contact", contact.id, { channelType: contact.channelType, purpose: contact.purpose });
          return contact;
        });
      },
      async changeVerification(command) {
        await requirePermission(options.authorizer, command.context, "master.contact.verify", { contactId: command.contactId });
        if (!await options.evidenceVerifier.verify(command.evidence)) throw new MasterDataError(422, "VERIFICATION_EVIDENCE_INVALID", "Provider evidence signature is invalid");
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          const contact = await options.repository.setContactVerification(command.context.tenantId, command.contactId, command.verified, now(), command.evidence, transaction);
          if (!contact) throw new MasterDataError(404, "CONTACT_NOT_FOUND", "Contact was not found");
          await effects(options, command.context, transaction, "master.contact.verification_changed", "verify", "contact", contact.id, { verified: command.verified, provider: command.evidence.provider, evidenceId: command.evidence.evidenceId });
          return contact;
        });
      },
      async deactivate(command) {
        await requirePermission(options.authorizer, command.context, "master.contact.pii.write", { contactId: command.contactId });
        await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          if (!await options.repository.deactivateContact(command.context.tenantId, command.contactId, command.effectiveUntil ?? now(), transaction)) throw new MasterDataError(404, "CONTACT_NOT_FOUND", "Contact was not found");
          await effects(options, command.context, transaction, "master.contact.deactivated", "deactivate", "contact", command.contactId);
        });
      },
    },
    addresses: {
      async create(command) {
        await requirePermission(options.authorizer, command.context, "master.address.pii.write", { ...command.owner });
        const normalized = normalizeAddress(command.address);
        const purpose = normalizePurpose(command.purpose);
        const roleQualifier = normalizeOptional(command.roleQualifier);
        return options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          await validateOwner(options, command.context, command.owner, transaction);
          const existing = await options.repository.findAddressDuplicate(command.context.tenantId, normalized.hash, transaction);
          const address = existing ?? await options.repository.createAddress(command.context.tenantId, normalized.address, normalized.hash, transaction);
          const link = await options.repository.createAddressLink({ tenantId: command.context.tenantId, addressId: address.id, owner: command.owner, purpose, ...(roleQualifier ? { roleQualifier } : {}), ...(normalizeOptional(command.attentionLine) ? { attentionLine: normalizeOptional(command.attentionLine) } : {}), isPrimary: command.isPrimary ?? false, effectiveFrom: command.effectiveFrom ?? now() }, transaction);
          await effects(options, command.context, transaction, "master.address.linked", "link", "address_link", link.id, { addressId: address.id, purpose, reusedAddress: Boolean(existing) });
          return link;
        });
      },
      async deactivate(command) {
        await requirePermission(options.authorizer, command.context, "master.address.pii.write", { addressLinkId: command.addressLinkId });
        await options.transactions.run(command.context.planeKey, actor(command.context), async (transaction) => {
          if (!await options.repository.deactivateAddressLink(command.context.tenantId, command.addressLinkId, command.effectiveUntil ?? now(), transaction)) throw new MasterDataError(404, "ADDRESS_LINK_NOT_FOUND", "Address link was not found");
          await effects(options, command.context, transaction, "master.address.deactivated", "deactivate", "address_link", command.addressLinkId);
        });
      },
    },
    ownerProfile: {
      async get(query) {
        await requirePermission(options.authorizer, query.context, "master.profile.read", { ...query.owner });
        await requirePermission(options.authorizer, query.context, "master.contact.pii.read", { ...query.owner });
        await requirePermission(options.authorizer, query.context, "master.address.pii.read", { ...query.owner });
        const asOf = query.asOf ?? now();
        return options.transactions.run(query.context.planeKey, actor(query.context), async (transaction) => {
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
async function requirePermission(authorizer: Authorizer, context: VerifiedRequestContext, permissionCode: string, resource: Readonly<Record<string, unknown>>): Promise<void> { const decision = await authorizer.authorize({ context, permissionCode, resource }); if (!decision.allowed) throw new MasterDataError(403, "FORBIDDEN", `Permission denied: ${permissionCode}`); }
function actor(context: VerifiedRequestContext) { return { tenantId: context.tenantId, principalId: context.principalId }; }
async function effects<Transaction>(options: MasterDataServiceOptions<Transaction>, context: VerifiedRequestContext, transaction: Transaction, eventCode: string, action: string, entityType: string, entityId: string, metadata: Readonly<Record<string, unknown>> = {}): Promise<void> {
  await options.outbox.append({ tenantId: context.tenantId, topic: "master-data", eventType: eventCode, entityType, entityId, actorId: context.principalId, correlationId: context.correlationId, payload: { entityType, entityId, ...metadata } }, transaction);
  await options.audit.record({ eventCode, action, outcome: "success", actor: { kind: "user", principalId: context.principalId }, tenantId: context.tenantId, entityType, entityId, requestId: context.requestId, ...(context.correlationId ? { correlationId: context.correlationId } : {}), metadata }, transaction);
}
