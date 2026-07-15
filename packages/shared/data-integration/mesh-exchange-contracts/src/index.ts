import { z } from "zod";

export const bnaCodeSchema = z.string().regex(/^BNA-[0-9]{10}$/);

export const networkAccountTypeSchema = z.enum(["buyer", "supplier", "both"]);
export const networkAccountStatusSchema = z.enum(["active", "inactive", "suspended", "retired"]);
export const networkParticipantTypeSchema = z.enum([
  "tenant_legal_entity",
  "partner_org",
  "platform",
  "individual",
]);
export const networkVerificationStatusSchema = z.enum([
  "unverified",
  "pending",
  "verified",
  "rejected",
  "expired",
]);
/** Canonical status for network_relationship (formerly network_connection). */
export const networkRelationshipStatusSchema = z.enum([
  "pending",
  "active",
  "suspended",
  "terminated",
  "rejected",
]);
/** @deprecated Renamed to networkRelationshipStatusSchema */
export const networkConnectionStatusSchema = networkRelationshipStatusSchema;

export const documentTypeSchema = z.enum([
  "purchase_order",
  "invoice",
  "credit_note",
  "debit_note",
  "remittance_advice",
  "acknowledgement",
]);
export const documentDirectionSchema = z.enum(["buyer_to_supplier", "supplier_to_buyer"]);
export const documentEnvelopeStatusSchema = z.enum([
  "received",
  "validated",
  "accepted",
  "rejected",
  "routed",
  "failed",
  "archived",
]);
export const documentEventTypeSchema = z.enum([
  "received",
  "validated",
  "accepted",
  "rejected",
  "routed",
  "failed",
  "archived",
  "acknowledged",
]);

const metadataSchema = z.record(z.string(), z.unknown()).default({});

export const networkAccountSchema = z.object({
  accountCode: bnaCodeSchema,
  providerCode: z.string().min(1),
  displayName: z.string().min(1),
  participantType: networkParticipantTypeSchema.optional(),
  sourcePlane: z.string().optional(),
  sourceRef: z.string().optional(),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  taxCountry: z.string().length(2).optional(),
  vatNumber: z.string().optional(),
  legalForm: z.string().optional(),
  registrationNo: z.string().optional(),
  registrationCountryCode: z.string().length(2).optional(),
  verificationStatus: networkVerificationStatusSchema.default("unverified"),
  verifiedAt: z.string().datetime().optional(),
  websiteUrl: z.string().url().optional(),
  description: z.string().optional(),
  foundedYear: z.number().int().optional(),
  status: networkAccountStatusSchema.default("active"),
  capabilities: metadataSchema,
  metadata: metadataSchema,
});

export const networkAccountIdentifierSchema = z.object({
  accountCode: bnaCodeSchema,
  scheme: z.string().min(1),
  value: z.string().min(1),
  isVerified: z.boolean().default(false),
  verifiedAt: z.string().datetime().optional(),
  metadata: metadataSchema,
});

export const networkRelationshipSchema = z.object({
  relationshipCode: z.string().min(1),
  buyerAccountCode: bnaCodeSchema,
  supplierAccountCode: bnaCodeSchema,
  status: networkRelationshipStatusSchema.default("pending"),
  capabilitySet: metadataSchema,
  termsSnapshot: metadataSchema,
  metadata: metadataSchema,
});
/** @deprecated Renamed to networkRelationshipSchema */
export const networkConnectionSchema = networkRelationshipSchema;

export const documentEnvelopeSchema = z.object({
  envelopeCode: z.string().min(1),
  relationshipId: z.string().uuid(),
  documentType: documentTypeSchema,
  documentDirection: documentDirectionSchema,
  senderAccountCode: bnaCodeSchema,
  receiverAccountCode: bnaCodeSchema,
  businessKey: z.string().optional(),
  correlationId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  payloadUri: z.string().optional(),
  payloadHash: z.string().optional(),
  payloadContentType: z.string().optional(),
  payloadSizeBytes: z.number().int().nonnegative().optional(),
  status: documentEnvelopeStatusSchema.default("received"),
  metadata: metadataSchema,
});

export const documentEventSchema = z.object({
  envelopeId: z.string().uuid(),
  eventType: documentEventTypeSchema,
  actorAccountCode: bnaCodeSchema.optional(),
  actorSubjectId: z.string().optional(),
  eventPayload: metadataSchema,
  occurredAt: z.string().datetime().optional(),
});

export const idempotencyKeySchema = z.object({
  accountCode: bnaCodeSchema,
  idempotencyKey: z.string().min(8),
  requestHash: z.string().min(16),
  responseStatus: z.number().int().min(100).max(599).optional(),
  responseBody: metadataSchema.optional(),
  expiresAt: z.string().datetime(),
});

export type BnaCode = z.infer<typeof bnaCodeSchema>;
export type NetworkParticipantType = z.infer<typeof networkParticipantTypeSchema>;
export type NetworkVerificationStatus = z.infer<typeof networkVerificationStatusSchema>;
export type NetworkAccountType = z.infer<typeof networkAccountTypeSchema>;
export type NetworkAccountStatus = z.infer<typeof networkAccountStatusSchema>;
export type NetworkAccount = z.infer<typeof networkAccountSchema>;
export type NetworkAccountIdentifier = z.infer<typeof networkAccountIdentifierSchema>;
export type NetworkRelationshipStatus = z.infer<typeof networkRelationshipStatusSchema>;
export type NetworkRelationship = z.infer<typeof networkRelationshipSchema>;
/** @deprecated Renamed to NetworkRelationship */
export type NetworkConnection = NetworkRelationship;
export type DocumentType = z.infer<typeof documentTypeSchema>;
export type DocumentDirection = z.infer<typeof documentDirectionSchema>;
export type DocumentEnvelope = z.infer<typeof documentEnvelopeSchema>;
export type DocumentEnvelopeStatus = z.infer<typeof documentEnvelopeStatusSchema>;
export type DocumentEvent = z.infer<typeof documentEventSchema>;
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
