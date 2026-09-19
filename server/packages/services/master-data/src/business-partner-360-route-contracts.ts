import {
  defineRouteContract,
  type JsonSchema,
  type RouteContract,
} from "@athyper/server-runtime-http";
import { BUSINESS_PARTNER_360_PERMISSIONS } from "@athyper/server-contract-master-data";
import { bp360ResponseSchemas } from "./business-partner-360-response-schemas.js";

const uuid = {
  type: "string",
  pattern:
    "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$",
} as const;
const params = {
  type: "object",
  properties: { businessPartnerId: uuid },
  required: ["businessPartnerId"],
} as const;
const query = {
  type: "object",
  properties: {
    operatingOrganizationId: uuid,
    companyCodeId: uuid,
    legalEntityId: uuid,
    roleLens: { enum: ["all", "supplier", "customer"] },
    asOf: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    cursor: { type: "string", minLength: 1, maxLength: 512 },
    limit: { type: "string", pattern: "^(?:[1-9][0-9]?|100)$" },
  },
} as const;
const problem = {
  type: "object",
  properties: {
    type: { type: "string" },
    title: { type: "string" },
    status: { type: "integer" },
    detail: { type: "string" },
    instance: { type: "string" },
    code: { type: "string" },
    requestId: { type: "string" },
  },
  required: ["type", "title", "status"],
} as const;
const errors = Object.fromEntries(
  [400, 401, 403, 404, 409, 422, 423, 428, 429, 500, 503].map((status) => [
    status,
    {
      description:
        "Request validation, authentication, authorization, state conflict or dependency failure; inspect the problem code.",
      contentType: "application/problem+json",
      body: problem,
    },
  ]),
);
function revealBody(field: string): JsonSchema {
  return {
    type: "object",
    required: [field, "purpose", "revealId", "purposeExpiresAt"],
    properties: {
      [field]: uuid,
      revealId: uuid,
      purpose: { type: "string", pattern: "^[a-z][a-z0-9_.-]{2,62}$" },
      purposeExpiresAt: {
        type: "string",
        minLength: 1,
        maxLength: 512,
        description:
          "An instant parseable by the platform temporal parser. The service validates expiry and purpose.",
      },
    },
  };
}
export const businessPartner360RouteContracts = {
  summary: defineRouteContract({
    method: "get",
    path: "/api/neon/business-partners/:businessPartnerId/360/summary",
    operationId: "businessPartner360.summary",
    summary: "Read Business Partner 360 summary",
    tags: ["Business Partner 360"],
    authenticated: true,
    permission: BUSINESS_PARTNER_360_PERMISSIONS.record,
    request: { params, query },
    responses: {
      ...errors,
      200: {
        description:
          "Scoped summary with completeness, permitted sections and provenance",
        body: bp360ResponseSchemas.BusinessPartner360Summary,
      },
    },
  }),
  section: defineRouteContract({
    method: "get",
    path: "/api/neon/business-partners/:businessPartnerId/360/:section",
    operationId: "businessPartner360.section",
    summary:
      "Read a Business Partner 360 section; section and field permissions are enforced by the service",
    tags: ["Business Partner 360"],
    authenticated: true,
    permission: BUSINESS_PARTNER_360_PERMISSIONS.record,
    request: {
      params: {
        ...params,
        properties: {
          ...params.properties,
          section: {
            type: "string",
            description:
              "Section code or compatibility alias. Inapplicable sections return 404.",
          },
        },
        required: ["businessPartnerId", "section"],
      },
      query,
    },
    responses: {
      ...errors,
      200: {
        description:
          "Section envelope; data is specific to the selected section, with redaction and freshness metadata",
        body: bp360ResponseSchemas.BusinessPartner360Section,
      },
    },
  }),
  createComment: defineRouteContract({
    method: "post",
    path: "/api/neon/business-partners/:businessPartnerId/360/comments",
    operationId: "businessPartner360.createComment",
    summary: "Add an internal comment to an authorized Business Partner",
    tags: ["Business Partner 360"],
    authenticated: true,
    permission: "collaboration.comment.create",
    request: {
      params,
      query,
      body: {
        type: "object",
        additionalProperties: false,
        required: ["text", "idempotencyKey"],
        properties: {
          text: { type: "string", minLength: 1, maxLength: 10000 },
          idempotencyKey: uuid,
        },
      },
    },
    responses: {
      ...errors,
      200: {
        description: "Created comment",
        body: {
          type: "object",
          properties: { id: uuid },
          required: ["id"],
          additionalProperties: true,
        },
      },
    },
  }),
  taxReveal: defineRouteContract({
    method: "post",
    path: "/api/neon/business-partners/:businessPartnerId/360/identifiers-tax/reveal",
    operationId: "businessPartner360.revealTax",
    summary:
      "Reveal a tax registration for an authorized, time-limited purpose",
    tags: ["Business Partner 360"],
    authenticated: true,
    permission: BUSINESS_PARTNER_360_PERMISSIONS.taxReveal,
    request: { params, query, body: revealBody("taxRegistrationId") },
    responses: {
      ...errors,
      200: {
        description: "Authorized tax value and expiry; never cache",
        body: bp360ResponseSchemas.BusinessPartner360TaxRevealResult,
      },
    },
  }),
  bankReveal: defineRouteContract({
    method: "post",
    path: "/api/neon/business-partners/:businessPartnerId/360/banking/reveal",
    operationId: "businessPartner360.revealBank",
    summary: "Reveal a bank account for an authorized, time-limited purpose",
    tags: ["Business Partner 360"],
    authenticated: true,
    permission: BUSINESS_PARTNER_360_PERMISSIONS.bankReveal,
    request: { params, query, body: revealBody("bankAccountLinkId") },
    responses: {
      ...errors,
      200: {
        description: "Authorized bank value and expiry; never cache",
        body: bp360ResponseSchemas.BusinessPartner360BankRevealResult,
      },
    },
  }),
} satisfies Record<string, RouteContract>;
