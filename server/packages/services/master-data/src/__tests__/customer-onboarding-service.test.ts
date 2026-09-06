import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  BusinessPartnerEligibilityRepository,
  CustomerAccountDesignation,
  CustomerCreditReview,
  PartnerEligibilityDecision,
} from "@athyper/server-contract-master-data";
import { describe, expect, it } from "vitest";
import { createBusinessPartnerEligibilityService } from "../business-partner-eligibility-service.js";

const maker = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "customer-maker",
} as VerifiedRequestContext;
const approver = {
  ...maker,
  principalId: "33333333-3333-4333-8333-333333333333",
  requestId: "customer-approver",
} as VerifiedRequestContext;
const bp = "44444444-4444-4444-8444-444444444444",
  customer = "55555555-5555-4555-8555-555555555555",
  organization = "66666666-6666-4666-8666-666666666666",
  company = "77777777-7777-4777-8777-777777777777";

function fixture(
  allow: (input: {
    readonly permissionCode: string;
    readonly resource: Readonly<Record<string, unknown>>;
  }) => boolean = () => true,
) {
  let review: CustomerCreditReview | undefined,
    designation: CustomerAccountDesignation | undefined,
    status: "prospect" | "active" | "suspended" | "inactive" | "archived" =
      "prospect",
    version = 1;
  const outboxPayloads: {eventType:string;payload:Record<string,unknown>}[] = [];
  const events: string[] = [],
    permissions: string[] = [];
  const repository = {
    async findCustomerCreditReviewByIdempotencyKey(
      _tenant: string,
      key: string,
    ) {
      return review && key === "customer-credit-create-001" ? review : null;
    },
    async createCustomerCreditReview(input: any) {
      review = {
        id: "88888888-8888-4888-8888-888888888888",
        tenantId: input.tenantId,
        businessPartnerId: input.businessPartnerId,
        customerId: input.customerId,
        operatingOrganizationId: input.operatingOrganizationId,
        companyCodeId: input.companyCodeId,
        reviewTypeCode: input.reviewTypeCode,
        requestedCreditLimit: input.requestedCreditLimit,
        requestedCurrencyCode: input.requestedCurrencyCode,
        effectiveFrom: input.effectiveFrom ?? "2026-08-29",
        decision: "pending",
        conditions: [],
        rowVersion: 1,
        createdAt: "2026-08-29T00:00:00.000Z",
        createdBy: input.createdBy,
      };
      return review;
    },
    async getCustomerCreditReview() {
      return review ?? null;
    },
    async decideCustomerCreditReview(input: any) {
      if (!review || review.rowVersion !== input.expectedVersion) return null;
      review = {
        ...review,
        decision: input.decision,
        decisionReason: input.reason,
        conditions: input.conditions ?? [],
        rowVersion: 2,
        reviewedAt: "2026-08-29T01:00:00.000Z",
        reviewedBy: input.decidedBy,
        ...(["approved", "conditional"].includes(input.decision)
          ? {
              approvedCreditLimit:
                input.approvedCreditLimit ?? review.requestedCreditLimit,
              approvedCurrencyCode:
                input.approvedCurrencyCode ?? review.requestedCurrencyCode,
              approvedAt: "2026-08-29T01:00:00.000Z",
              approvedBy: input.decidedBy,
            }
          : {}),
      };
      return { review, replayed: false };
    },
    async listCustomerCreditReviews() {
      return review ? [review] : [];
    },
    async findCustomerDesignationByIdempotencyKey(
      _tenant: string,
      key: string,
    ) {
      return designation && key === "customer-designation-create-001"
        ? designation
        : null;
    },
    async createCustomerDesignation(input: any) {
      designation = {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        tenantId: input.tenantId,
        businessPartnerId: input.businessPartnerId,
        customerId: input.customerId,
        operatingOrganizationId: input.operatingOrganizationId,
        companyCodeId: input.companyCodeId,
        countryCode: input.countryCode,
        channelCode: input.channelCode,
        designationType: input.designationType,
        priorityTier: input.priorityTier,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        rationale: input.rationale,
        status: "pending",
        rowVersion: 1,
        createdAt: "2026-09-05T00:00:00.000Z",
        createdBy: input.createdBy,
      };
      return designation;
    },
    async getCustomerDesignation() {
      return designation ?? null;
    },
    async decideCustomerDesignation(input: any) {
      if (!designation || designation.rowVersion !== input.expectedVersion)
        return null;
      designation = {
        ...designation,
        status: input.decision,
        decisionReason: input.reason,
        rowVersion: designation.rowVersion + 1,
      };
      return { designation, replayed: false };
    },
    async listCustomerDesignations() {
      return designation ? [designation] : [];
    },
    async resolve(input: any) {
      // Exercise the real lifecycle/readiness boundary instead of accepting orders
      // from a suspended Customer in this test double.
      if (status === "suspended") expect(input.operationCode).toBe("activation");
      const raw: Omit<PartnerEligibilityDecision, "decisionFingerprint"> = {
        businessPartnerId: input.businessPartnerId,
        role: "customer",
        operatingOrganizationId: input.operatingOrganizationId,
        companyCodeId: input.companyCodeId,
        operationCode: input.operationCode,
        businessDate: input.businessDate,
        eligible: review?.decision === "approved",
        reasons:
          review?.decision === "approved"
            ? []
            : [
                {
                  code: "CREDIT_REVIEW_PENDING",
                  severity: "blocking",
                  recordId: review?.id,
                },
              ],
        qualifications: [],
        activeBlockIds: [],
        preferredSupplier: false,
        effectivePreferenceIds: [],
      };
      return raw;
    },
    async transitionCustomer(input: any) {
      const from =
        input.action === "activate"
          ? "prospect"
          : input.action === "suspend"
            ? "active"
            : input.action === "reactivate"
              ? "suspended"
              : input.action === "archive"
                ? "inactive"
                : status;
      if (status !== from || version !== input.expectedVersion) return null;
      status =
        input.action === "suspend"
          ? "suspended"
          : input.action === "deactivate"
            ? "inactive"
            : input.action === "archive"
              ? "archived"
              : "active";
      version += 1;
      return {
        customerId: input.customerId,
        status,
        resultingVersion: version,
        eventId: "99999999-9999-4999-8999-999999999999",
        replayed: false,
        readiness: input.readiness,
      };
    },
  } as unknown as BusinessPartnerEligibilityRepository<object>;
  const service = createBusinessPartnerEligibilityService({
    repository,
    authorizer: {
      async authorize(input) {
        permissions.push(input.permissionCode);
        return { allowed: allow(input) };
      },
    },
    transactions: {
      async run(_plane, _actor, work) {
        return work({});
      },
    },
    audit: {
      async record(input) {
        events.push(input.eventCode);
        return {} as never;
      },
    },
    outbox: {
      async append(input) {
        events.push(input.eventType);
        outboxPayloads.push({eventType:input.eventType,payload:input.payload as Record<string,unknown>});
      },
    },
  });
  return {
    service,
    events,
    outboxPayloads,
    permissions,
    get review() {
      return review;
    },
    get status() {
      return status;
    },
  };
}

describe("customer onboarding controls", () => {
  it("keeps credit approval independent and enforces maker-checker", async () => {
    const value = fixture(),
      created = await value.service.createCustomerCreditReview({
        context: maker,
        idempotencyKey: "customer-credit-create-001",
        businessPartnerId: bp,
        customerId: customer,
        operatingOrganizationId: organization,
        companyCodeId: company,
        reviewTypeCode: "initial",
        requestedCreditLimit: 25000,
        requestedCurrencyCode: "MYR",
        effectiveFrom: "2026-08-29",
      });
    expect(created.review.decision).toBe("pending");
    await expect(
      value.service.decideCustomerCreditReview({
        context: maker,
        reviewId: created.review.id,
        expectedVersion: 1,
        decision: "approved",
        reason: "Approved",
        idempotencyKey: "customer-credit-decision-001",
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_CREDIT_SELF_APPROVAL_FORBIDDEN",
    });
    const decided = await value.service.decideCustomerCreditReview({
      context: approver,
      reviewId: created.review.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Commercial evidence accepted",
      idempotencyKey: "customer-credit-decision-001",
    });
    expect(decided.review).toMatchObject({
      decision: "approved",
      approvedBy: approver.principalId,
    });
    expect(value.status).toBe("prospect");
    expect(value.permissions).toEqual([
      "neon.customer.credit.create",
      "neon.customer.credit.decide",
    ]);
  });
  it("denies an unauthorized sales or company scope before persistence", async () => {
    const value = fixture(
      (input) =>
        input.resource["operatingOrganizationId"] === organization &&
        input.resource["companyCodeId"] === company,
    );
    await expect(
      value.service.createCustomerCreditReview({
        context: maker,
        idempotencyKey: "customer-credit-create-denied",
        businessPartnerId: bp,
        customerId: customer,
        operatingOrganizationId: organization,
        companyCodeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        reviewTypeCode: "initial",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(value.review).toBeUndefined();
  });
  it("retains a negative credit decision and rejects stale follow-up commands", async () => {
    const value = fixture();
    const created = await value.service.createCustomerCreditReview({context:maker,idempotencyKey:"customer-credit-negative-001",businessPartnerId:bp,customerId:customer,operatingOrganizationId:organization,companyCodeId:company,reviewTypeCode:"initial",requestedCreditLimit:50000,requestedCurrencyCode:"MYR",effectiveFrom:"2026-09-05"});
    const rejected = await value.service.decideCustomerCreditReview({context:approver,reviewId:created.review.id,expectedVersion:1,decision:"rejected",reason:"Risk threshold exceeded",idempotencyKey:"customer-credit-negative-decision-001"});
    expect(rejected.review).toMatchObject({decision:"rejected",decisionReason:"Risk threshold exceeded",rowVersion:2});
    expect(rejected.review.approvedCreditLimit).toBeUndefined();
    await expect(value.service.decideCustomerCreditReview({context:approver,reviewId:created.review.id,expectedVersion:1,decision:"approved",reason:"Stale override",idempotencyKey:"customer-credit-stale-decision-001"})).rejects.toMatchObject({code:"CUSTOMER_CREDIT_DECISION_CONFLICT"});
  });
  it("executes all five scoped lifecycle commands with optimistic versions", async () => {
    const value = fixture(),
      credit = await value.service.createCustomerCreditReview({
        context: maker,
        idempotencyKey: "customer-credit-create-001",
        businessPartnerId: bp,
        customerId: customer,
        operatingOrganizationId: organization,
        companyCodeId: company,
        reviewTypeCode: "initial",
        requestedCreditLimit: 25000,
        requestedCurrencyCode: "MYR",
        effectiveFrom: "2026-08-29",
      });
    await value.service.decideCustomerCreditReview({
      context: approver,
      reviewId: credit.review.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Approved",
      idempotencyKey: "customer-credit-decision-001",
    });
    const base = {
      context: approver,
      businessPartnerId: bp,
      customerId: customer,
      operatingOrganizationId: organization,
      companyCodeId: company,
      businessDate: "2026-08-29",
    };
    await expect(
      value.service.transitionCustomer({
        ...base,
        action: "activate",
        expectedVersion: 1,
        reasonCode: "CUSTOMER_READY",
        idempotencyKey: "customer-activate-001",
      }),
    ).resolves.toMatchObject({ status: "active", resultingVersion: 2 });
    await expect(
      value.service.transitionCustomer({
        ...base,
        action: "suspend",
        expectedVersion: 2,
        reasonCode: "CREDIT_HOLD",
        idempotencyKey: "customer-suspend-001",
      }),
    ).resolves.toMatchObject({ status: "suspended", resultingVersion: 3 });
    await expect(
      value.service.transitionCustomer({
        ...base,
        action: "reactivate",
        expectedVersion: 3,
        reasonCode: "CREDIT_RESTORED",
        idempotencyKey: "customer-reactivate-001",
      }),
    ).resolves.toMatchObject({ status: "active", resultingVersion: 4 });
    await expect(
      value.service.transitionCustomer({
        ...base,
        action: "deactivate",
        expectedVersion: 4,
        reasonCode: "CUSTOMER_CLOSED",
        idempotencyKey: "customer-deactivate-001",
      }),
    ).resolves.toMatchObject({ status: "inactive", resultingVersion: 5 });
    await expect(
      value.service.transitionCustomer({
        ...base,
        action: "archive",
        expectedVersion: 5,
        reasonCode: "RETENTION_COMPLETE",
        idempotencyKey: "customer-archive-001",
      }),
    ).resolves.toMatchObject({ status: "archived", resultingVersion: 6 });
    expect(value.events).toContain("customer.portal_iam_projection.requested");
    const notifications=value.outboxPayloads.filter(event=>/^business_partner\.customer\.(activated|suspended|reactivated|deactivated|archived)$/.test(event.eventType));
    expect(notifications).toHaveLength(5);
    for(const event of notifications) expect(event.payload).toMatchObject({recipient_principal_ids:[approver.principalId],customerId:customer,lifecycleEventId:expect.any(String),resultingVersion:expect.any(Number)});
  });
  it("governs scoped designations with maker-checker and versioned decisions", async () => {
    const value = fixture();
    const created = await value.service.createCustomerDesignation({
      context: maker,
      idempotencyKey: "customer-designation-create-001",
      businessPartnerId: bp,
      customerId: customer,
      operatingOrganizationId: organization,
      companyCodeId: company,
      countryCode: "MY",
      channelCode: "direct",
      designationType: "strategic",
      priorityTier: 1,
      effectiveFrom: "2026-09-05",
      rationale: "Regional account governance",
    });
    expect(created.designation).toMatchObject({
      status: "pending",
      designationType: "strategic",
      rowVersion: 1,
      countryCode: "MY",
      channelCode: "direct",
    });
    await expect(
      value.service.createCustomerDesignation({
        context: maker,
        idempotencyKey: "customer-designation-create-001",
        businessPartnerId: bp,
        customerId: customer,
        operatingOrganizationId: organization,
        companyCodeId: company,
        designationType: "strategic",
        priorityTier: 1,
        effectiveFrom: "2026-09-05",
        rationale: "Different replay content",
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_DESIGNATION_IDEMPOTENCY_CONFLICT",
    });
    await expect(
      value.service.decideCustomerDesignation({
        context: maker,
        designationId: created.designation.id,
        expectedVersion: 1,
        decision: "approved",
        reason: "Designation approved",
        idempotencyKey: "customer-designation-decision-self",
      }),
    ).rejects.toMatchObject({
      code: "CUSTOMER_DESIGNATION_SELF_APPROVAL_FORBIDDEN",
    });
    const approved = await value.service.decideCustomerDesignation({
      context: approver,
      designationId: created.designation.id,
      expectedVersion: 1,
      decision: "approved",
      reason: "Designation approved",
      idempotencyKey: "customer-designation-decision-001",
    });
    expect(approved.designation).toMatchObject({
      status: "approved",
      rowVersion: 2,
    });
    expect(value.status).toBe("prospect");
    await expect(
      value.service.decideCustomerDesignation({
        context: approver,
        designationId: created.designation.id,
        expectedVersion: 1,
        decision: "revoked",
        reason: "Stale revoke",
        idempotencyKey: "customer-designation-revoke-stale",
      }),
    ).rejects.toMatchObject({ code: "CUSTOMER_DESIGNATION_DECISION_CONFLICT" });
    expect(value.permissions).toContain("neon.customer.designation.create");
    expect(value.permissions).toContain("neon.customer.designation.decide");
  });
});
