import { createBusinessPartnerCompanyPilotService } from "../business-partner-company-pilot.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  BusinessPartnerRequest,
  BusinessPartnerRequestRepository,
  BusinessPartnerRequestValidationResult,
  CreateBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import { describe, expect, it, vi } from "vitest";
import {
  createBusinessPartnerRequestService,
  createBusinessPartnerRequestValidator,
  MasterDataError,
} from "../index.js";

const primaryRelationships = {
  addresses: [{ clientItemKey: "address-1", isPrimary: true }],
  contactPersons: [{ clientItemKey: "contact-1", isPrimary: true }],
  contactChannels: [{ contactClientItemKey: "contact-1", isPrimary: true }],
};
const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  requestId: "33333333-3333-4333-8333-333333333333",
  profileHash: "profile",
  permissions: { allowed: [] },
} as unknown as VerifiedRequestContext;
const schema = {
  code: "neon.business_partner_request",
  version: 1,
  hash: "a".repeat(64),
  releaseId: "00000000-0000-4000-8000-000000000001",
} as const;

class MemoryRepository implements BusinessPartnerRequestRepository<object> {
  readonly rows = new Map<string, BusinessPartnerRequest>();
  readonly validations: BusinessPartnerRequestValidationResult[] = [];
  submissionCount = 0;
  workflowTask:
    | {
        readonly requestId: string;
        readonly stageId: string;
        readonly workItemId: string;
        readonly ownerPrincipalId: string;
        workItemVersion: number;
        workItemStatus: string;
      }
    | undefined;
  async findByIdempotencyKey(tenantId: string, key: string) {
    return (
      [...this.rows.values()].find(
        (row) => row.tenantId === tenantId && row.idempotencyKey === key,
      ) ?? null
    );
  }
  async create(
    input: Parameters<BusinessPartnerRequestRepository<object>["create"]>[0],
  ) {
    const source = input.command.source;
    const registrationMode =
      input.command.registrationMode ??
      (source.kind === "manual"
        ? "direct"
        : source.kind === "portal"
          ? "self_service"
          : "integration");
    const row: BusinessPartnerRequest = {
      id: "44444444-4444-4444-8444-444444444444",
      tenantId: input.tenantId,
      requestNo: input.requestNo,
      kind: input.command.kind,
      source,
      registrationMode,
      ...(input.command.invitationId
        ? { invitationId: input.command.invitationId }
        : {}),
      ...(input.command.applicantPrincipalId
        ? { applicantPrincipalId: input.command.applicantPrincipalId }
        : {}),
      ...(input.command.representedPartyName
        ? { representedPartyName: input.command.representedPartyName }
        : {}),
      ...(input.command.representationEvidenceId
        ? { representationEvidenceId: input.command.representationEvidenceId }
        : {}),
      ...(input.command.targetBusinessPartnerId
        ? { targetBusinessPartnerId: input.command.targetBusinessPartnerId }
        : {}),
      ...(input.command.requestedRole
        ? { requestedRole: input.command.requestedRole }
        : {}),
      operatingOrganizationId: input.command.operatingOrganizationId,
      ...(input.command.companyCodeId
        ? { companyCodeId: input.command.companyCodeId }
        : {}),
      schema: input.schema,
      proposedPayload: input.command.proposedPayload,
      extensionSummary: {
        mode: "typed_v1",
        counts: {
          addresses: input.command.extensions?.addresses?.length ?? 0,
          contactPersons: input.command.extensions?.contactPersons?.length ?? 0,
          contactChannels:
            input.command.extensions?.contactChannels?.length ?? 0,
          identifiers: input.command.extensions?.identifiers?.length ?? 0,
          taxRegistrations:
            input.command.extensions?.taxRegistrations?.length ?? 0,
          classifications:
            input.command.extensions?.classifications?.length ?? 0,
          certifications: input.command.extensions?.certifications?.length ?? 0,
        },
      },
      validationSummary: {},
      duplicateSummary: {},
      changeImpact: {},
      idempotencyKey: input.command.idempotencyKey,
      status: "draft",
      rowVersion: 1,
      createdAt: "2026-08-28T00:00:00.000Z",
      createdBy: input.createdBy,
    };
    this.rows.set(row.id, row);
    return row;
  }
  async get(tenantId: string, requestId: string) {
    const row = this.rows.get(requestId);
    return row?.tenantId === tenantId ? row : null;
  }
  async getView(tenantId: string, requestId: string) {
    const request = await this.get(tenantId, requestId);
    if (!request) return null;
    const validation = this.validations.at(-1),
      task = this.workflowTask;
    return {
      request,
      validationFindings: validation?.findings ?? [],
      ...(request.workflowRequestId && task
        ? {
            workflow: {
              ...task,
              definition: {
                code: "neon.business_partner.onboarding",
                version: 1,
                hash: "b".repeat(64),
              },
            },
          }
        : {}),
    };
  }
  async list(
    query: Parameters<BusinessPartnerRequestRepository<object>["list"]>[0],
  ) {
    return [...this.rows.values()].filter(
      (row) =>
        row.tenantId === query.tenantId &&
        row.operatingOrganizationId === query.operatingOrganizationId,
    );
  }
  async getAggregate(
    tenantId: string,
    businessPartnerId: string,
    operatingOrganizationId: string,
  ) {
    const request = [...this.rows.values()].find(
      (row) =>
        row.tenantId === tenantId &&
        row.materializedBusinessPartnerId === businessPartnerId &&
        row.operatingOrganizationId === operatingOrganizationId,
    );
    if (!request) return null;
    return {
      businessPartner: {
        id: businessPartnerId,
        code: "BP.TEST",
        name: "Acme",
        partnerCategory: "organization",
        aliases: [],
        status: "active",
        createdAt: "2026-08-28T04:00:00.000Z",
      },
      suppliers: request.materializedSupplierId
        ? [
            {
              id: request.materializedSupplierId,
              supplierCode: "SUP.TEST",
              supplierType: "general",
              status: "onboarding",
              createdAt: "2026-08-28T04:00:00.000Z",
            },
          ]
        : [],
      customers: request.materializedCustomerId
        ? [
            {
              id: request.materializedCustomerId,
              customerCode: "CUS.TEST",
              customerType: "corporate",
              status: "prospect",
              designations: [],
              createdAt: "2026-08-28T04:00:00.000Z",
            },
          ]
        : [],
      organizationAssignments: [
        {
          id: request.materializedOperatingOrganizationAssignmentId!,
          operatingOrganizationId,
          operatingOrganizationCode: "organization",
          operatingOrganizationName: "Organization",
          partnerRole: request.requestedRole!,
          status: "active",
          effectiveFrom: "2026-08-28",
        },
      ],
      onboardingRequests: [request],
    };
  }
  async patch(
    input: Parameters<BusinessPartnerRequestRepository<object>["patch"]>[0],
  ) {
    const row = this.rows.get(input.requestId);
    if (!row || row.rowVersion !== input.expectedVersion) return null;
    const updated = {
      ...row,
      proposedPayload: { ...row.proposedPayload, ...input.proposedPayload },
      validationSummary: {},
      duplicateSummary: {},
      changeImpact: {},
      rowVersion: row.rowVersion + 1,
      updatedBy: input.updatedBy,
    };
    this.rows.set(row.id, updated);
    return updated;
  }
  async recordValidation(
    input: Parameters<
      BusinessPartnerRequestRepository<object>["recordValidation"]
    >[0],
  ) {
    const row = this.rows.get(input.requestId);
    if (
      !row ||
      row.rowVersion !== input.expectedVersion ||
      !["draft", "validation_failed", "returned"].includes(row.status)
    )
      return null;
    this.validations.push(input.result);
    const updated: BusinessPartnerRequest = {
      ...row,
      status: input.result.valid ? "draft" : "validation_failed",
      validationSummary: input.result.validationSummary,
      duplicateSummary: input.result.duplicateSummary,
      changeImpact: input.result.changeImpact,
      rowVersion: row.rowVersion + 2,
      updatedBy: input.evaluatedBy,
    };
    this.rows.set(row.id, updated);
    return updated;
  }
  async submit(
    input: Parameters<BusinessPartnerRequestRepository<object>["submit"]>[0],
  ) {
    const row = this.rows.get(input.requestId);
    if (row?.status === "pending_approval") return null;
    if (
      !row ||
      row.rowVersion !== input.expectedVersion ||
      row.validationSummary["outcome"] !== "passed"
    )
      return null;
    const updated: BusinessPartnerRequest = {
      ...row,
      status: "pending_approval",
      rowVersion: row.rowVersion + 2,
      workflowRequestId: "77777777-7777-4777-8777-777777777777",
      decisionFingerprint: input.decisionFingerprint,
      submittedAt: "2026-08-28T02:00:00.000Z",
      submittedBy: input.submittedBy,
    };
    this.rows.set(row.id, updated);
    this.submissionCount += 1;
    this.workflowTask = {
      requestId: updated.workflowRequestId!,
      stageId:
        this.submissionCount === 1
          ? "88888888-8888-4888-8888-888888888888"
          : "88888888-8888-4888-8888-888888888887",
      workItemId:
        this.submissionCount === 1
          ? "99999999-9999-4999-8999-999999999999"
          : "99999999-9999-4999-8999-999999999998",
      workItemVersion: 1,
      workItemStatus: "open",
      ownerPrincipalId: input.definition.approverPrincipalIds[0]!,
    };
    return {
      request: updated,
      workflow: {
        requestId: updated.workflowRequestId!,
        stageId: this.workflowTask.stageId,
        workItemId: this.workflowTask.workItemId,
        workItemVersion: this.workflowTask.workItemVersion,
        definition: {
          code: input.definition.code,
          version: input.definition.version,
          hash: input.definition.hash,
        },
        decisionFingerprint: input.decisionFingerprint,
      },
      replayed: false,
    };
  }
  async decide(
    input: Parameters<BusinessPartnerRequestRepository<object>["decide"]>[0],
  ) {
    const row = this.rows.get(input.command.requestId),
      task = this.workflowTask;
    if (
      !row ||
      !task ||
      row.status !== "pending_approval" ||
      row.rowVersion !== input.command.expectedRequestVersion ||
      task.workItemId !== input.command.workItemId ||
      task.workItemVersion !== input.command.expectedWorkItemVersion ||
      task.ownerPrincipalId !== input.decidedBy ||
      task.workItemStatus !== "open"
    )
      return null;
    task.workItemStatus = "completed";
    task.workItemVersion += 1;
    const status =
      input.command.decision === "approve"
        ? "approved"
        : input.command.decision === "reject"
          ? "rejected"
          : "returned";
    const updated: BusinessPartnerRequest = {
      ...row,
      status,
      rowVersion: row.rowVersion + 1,
      ...(status === "approved"
        ? {
            approvedAt: "2026-08-28T03:00:00.000Z",
            approvedBy: input.decidedBy,
          }
        : {}),
    };
    this.rows.set(row.id, updated);
    return {
      request: updated,
      workflow: {
        requestId: input.command.workflowRequestId,
        stageId: task.stageId,
        workItemId: input.command.workItemId,
        workItemVersion: task.workItemVersion,
        definition: {
          code: "neon.business_partner.onboarding",
          version: 1,
          hash: "b".repeat(64),
        },
        decisionFingerprint: row.decisionFingerprint!,
      },
      decision: input.command.decision,
      decisionFingerprint: input.decisionFingerprint,
      replayed: false,
    };
  }
  async apply(
    input: Parameters<BusinessPartnerRequestRepository<object>["apply"]>[0],
  ) {
    const row = this.rows.get(input.command.requestId);
    if (
      row?.status === "applied" &&
      row.applicationIdempotencyKey === input.command.idempotencyKey &&
      row.applicationFingerprint === input.applicationFingerprint
    )
      return application(row, true);
    if (
      !row ||
      row.status !== "approved" ||
      row.rowVersion !== input.command.expectedVersion
    )
      return null;
    const updated: BusinessPartnerRequest = {
      ...row,
      status: "applied",
      rowVersion: row.rowVersion + 2,
      materializedBusinessPartnerId:
        row.targetBusinessPartnerId ?? "10101010-1010-4010-8010-101010101010",
      ...(row.requestedRole === "customer"
        ? { materializedCustomerId: "14141414-1010-4010-8010-101010101010" }
        : { materializedSupplierId: "11111111-1010-4010-8010-101010101010" }),
      materializedOperatingOrganizationAssignmentId:
        "12121212-1010-4010-8010-101010101010",
      materializationSnapshotId: "13131313-1010-4010-8010-101010101010",
      applicationIdempotencyKey: input.command.idempotencyKey,
      applicationFingerprint: input.applicationFingerprint,
      appliedAt: "2026-08-28T04:00:00.000Z",
      appliedBy: input.appliedBy,
    };
    this.rows.set(row.id, updated);
    return application(updated, false);
  }
}

function application(request: BusinessPartnerRequest, replayed: boolean) {
  const partnerRole = request.materializedCustomerId
    ? ("customer" as const)
    : ("supplier" as const);
  const roleId =
    request.materializedCustomerId ?? request.materializedSupplierId!;
  return {
    request,
    materialization: {
      businessPartnerId: request.materializedBusinessPartnerId!,
      partnerRole,
      roleId,
      ...(request.materializedSupplierId
        ? { supplierId: request.materializedSupplierId }
        : {}),
      ...(request.materializedCustomerId
        ? { customerId: request.materializedCustomerId }
        : {}),
      operatingOrganizationAssignmentId:
        request.materializedOperatingOrganizationAssignmentId!,
      snapshotId: request.materializationSnapshotId!,
      applicationFingerprint: request.applicationFingerprint!,
      extensionMaterializationCounts: request.extensionSummary.counts,
    },
    replayed,
  };
}

function command(
  overrides: Partial<CreateBusinessPartnerRequestCommand> = {},
): CreateBusinessPartnerRequestCommand {
  return {
    context,
    idempotencyKey: "request-key-001",
    kind: "new_partner",
    source: { kind: "manual" },
    requestedRole: "supplier",
    operatingOrganizationId: "55555555-5555-4555-8555-555555555555",
    ...overrides,
    proposedPayload: {
      ...(overrides.proposedPayload === undefined ? { name: "Acme" } : {}),
      ownershipClass: "internal",
      [overrides.requestedRole === "customer"
        ? "customerType"
        : "supplierType"]:
        overrides.proposedPayload?.["ownershipClass"] === "external"
          ? overrides.requestedRole === "customer"
            ? "corporate"
            : "general"
          : "intercompany",
      ...overrides.proposedPayload,
    },
  };
}

function fixture(
  allowed:
    | boolean
    | ((
        permissionCode: string,
        resource?: Readonly<Record<string, unknown>>,
      ) => boolean) = true,
  denialReason = "test",
  companyPilot = false,
  validateIntake?: (command:CreateBusinessPartnerRequestCommand)=>Promise<void>,
) {
  const repository = new MemoryRepository(),
    permissions: string[] = [],
    effects: string[] = [],
    outboxEvents: Array<Readonly<Record<string, unknown>>> = [];
  const createService = companyPilot
    ? createBusinessPartnerCompanyPilotService
    : createBusinessPartnerRequestService;
  const service = createService({
    validateIntake,
    refreshContext: async (context: VerifiedRequestContext) => context,
    requirePublishedOperation: async () => {},
    resolveScope: async (
      input: import("../business-partner-company-pilot.js").CompanyPilotScopeRequest,
    ) => {
      const companyCodeId =
        input.target === "existing"
          ? repository.rows.get(input.recordId ?? "")?.companyCodeId
          : input.coordinates.companyCodeId;
      return companyCodeId ? { companyCodeId } : null;
    },
    repository,
    authorizer: {
      async authorize(request) {
        permissions.push(request.permissionCode);
        return (
          typeof allowed === "function"
            ? allowed(request.permissionCode, request.resource)
            : allowed
        )
          ? { allowed: true }
          : { allowed: false, reason: denialReason };
      },
    },
    schemas: {
      async resolve() {
        return schema;
      },
    },
    // Workflow fixtures provide a complete relationship projection; dedicated validator
    // regressions below exercise absent and incompatible persisted proposals.
    validator: {
      async validate(input, tx) {
        return createBusinessPartnerRequestValidator({
          duplicates: {
            async findExactName() {
              return [];
            },
          },
          createEvaluationId: () => "66666666-6666-4666-8666-666666666666",
          now: () => new Date("2026-08-28T01:00:00.000Z"),
        }).validate(
          {
            ...input,
            request: {
              ...input.request,
              proposedPayload: {
                relationshipProposals: primaryRelationships,
                ...input.request.proposedPayload,
              },
            },
          },
          tx,
        );
      },
    },
    workflows: {
      async resolve() {
        return {
          code: "neon.business_partner.onboarding",
          version: 1,
          hash: "b".repeat(64),
          stageCode: "business_review",
          stageName: "Business Partner Review",
          approverPrincipalIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        };
      },
    },
    transactions: {
      async run(_plane, _actor, work) {
        return work({});
      },
    },
    audit: {
      async record(input) {
        effects.push(input.eventCode);
        return {} as never;
      },
    },
    outbox: {
      async append(input) {
        effects.push(input.eventType);
        outboxEvents.push(
          input as unknown as Readonly<Record<string, unknown>>,
        );
      },
    },
    createRequestNo: () => "BPR-TEST-001",
  });
  return { service, repository, permissions, effects, outboxEvents };
}

describe("Business Partner request service", () => {
  it("rejects invalid metadata input before creating a case or side effects",async()=>{
    const errors=[{fieldPath:"name",code:"maxLength",messageKey:"validation.maxLength",params:{field:"Registered name",max:100}}];
    const validate=vi.fn(async()=>{throw new MasterDataError(422,"INTAKE_VALIDATION_FAILED","Invalid fields",errors);});
    const value=fixture(true,"test",false,validate);
    await expect(value.service.create(command({proposedPayload:{name:"x".repeat(101)}}))).rejects.toMatchObject({status:422,fieldErrors:errors});
    expect(validate).toHaveBeenCalledOnce();expect(value.repository.rows.size).toBe(0);expect(value.effects).toEqual([]);
  });

  it("types direct, portal, integration, and on-behalf registration coordinates", async () => {
    const value = fixture();
    const direct = await value.service.create(command());
    expect(direct.request.registrationMode).toBe("direct");
    await expect(
      value.service.create(
        command({
          idempotencyKey: "invalid-portal-001",
          source: { kind: "portal" },
          registrationMode: "self_service",
        }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    await expect(
      value.service.create(
        command({
          idempotencyKey: "invalid-integration-001",
          source: { kind: "manual" },
          registrationMode: "integration",
        }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    const represented = await value.service.create(
      command({
        idempotencyKey: "on-behalf-001",
        registrationMode: "on_behalf",
        representedPartyName: "Acme Supplier",
      }),
    );
    expect(represented.request).toMatchObject({
      registrationMode: "on_behalf",
      representedPartyName: "Acme Supplier",
    });
  });

  it("creates once and replays the same internal NEON command without duplicate effects", async () => {
    const value = fixture();
    const first = await value.service.create(command()),
      second = await value.service.create(command());
    expect(first).toMatchObject({
      replayed: false,
      request: { status: "draft", source: { kind: "manual" } },
    });
    expect(second).toMatchObject({
      replayed: true,
      request: { id: first.request.id },
    });
    expect(value.effects).toEqual([
      "business_partner.case.created",
      "business_partner.case.created",
    ]);
    expect(value.permissions).toEqual([
      "neon.relationship.entity_case.create",
      "neon.relationship.entity_case.create",
    ]);
  });

  it("rejects a stale viewed form release before creating a case", async () => {
    const value = fixture();
    await expect(
      value.service.create(
        command({ expectedForm: { ...schema, hash: "c".repeat(64) } }),
      ),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_FORM_CHANGED",
      status: 409,
    });
    expect(value.repository.rows.size).toBe(0);
  });

  it("requires pinned MESH projection evidence before authorization or persistence", async () => {
    const value = fixture();
    await expect(
      value.service.create(
        command({ source: { kind: "mesh", systemCode: "athyper_mesh" } }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    expect(value.permissions).toEqual([]);
    expect(value.repository.rows.size).toBe(0);
  });

  it("persists identity extensions as typed coordinates and keeps them outside the general payload", async () => {
    const value = fixture();
    const created = await value.service.create(
      command({
        extensions: {
          identifiers: [
            {
              clientItemKey: "duns-1",
              definitionFieldCode: "identity.identifier.duns",
              schemeCode: "duns",
              value: "123456789",
              valueHash: "b".repeat(64),
              maskedValue: "*****6789",
              isPrimary: true,
            },
          ],
          taxRegistrations: [
            {
              clientItemKey: "tax-1",
              definitionFieldCode: "tax.registration.primary",
              jurisdictionId: "77777777-7777-4777-8777-777777777777",
              registrationTypeCode: "vat",
              protectedValueToken: "vault:tax:opaque-001",
              valueHash: "c".repeat(64),
              maskedValue: "VAT-****42",
              isPrimary: true,
            },
          ],
        },
      }),
    );
    expect(created.request.proposedPayload).toMatchObject({
      name: "Acme",
    });
    expect(created.request.extensionSummary).toMatchObject({
      mode: "typed_v1",
      counts: { identifiers: 1, taxRegistrations: 1 },
    });
  });

  it("rejects identity extension families in unrestricted JSON and raw tax values in typed tax rows", async () => {
    const value = fixture();
    await expect(
      value.service.create(
        command({
          proposedPayload: {
            name: "Acme",
            taxRegistrations: [{ registrationNumber: "RAW-TAX-ID" }],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    await expect(
      value.service.create(
        command({
          idempotencyKey: "raw-tax-extension-001",
          extensions: {
            taxRegistrations: [
              {
                clientItemKey: "tax-1",
                definitionFieldCode: "tax.registration.primary",
                jurisdictionId: "77777777-7777-4777-8777-777777777777",
                registrationTypeCode: "vat",
                protectedValueToken: "",
                valueHash: "c".repeat(64),
                maskedValue: "VAT-****42",
              },
            ],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    await expect(
      value.service.create(
        command({
          idempotencyKey: "raw-national-id-001",
          extensions: {
            identifiers: [
              {
                clientItemKey: "nid-1",
                definitionFieldCode: "identity.identifier.national",
                schemeCode: "national_id",
                value: "RAW-NATIONAL-ID",
                valueHash: "d".repeat(64),
                maskedValue: "*****1234",
              },
            ],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_INVALID" });
    expect(value.repository.rows.size).toBe(0);
    expect(value.permissions).toEqual([]);
  });

  it("requires an exact company coordinate for a role-specific finance configuration", async () => {
    const value = fixture();
    const base = {
      kind: "configure_company" as const,
      targetBusinessPartnerId: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
      requestedRole: "supplier" as const,
      proposedPayload: { currencyCode: "USD" },
    };
    await expect(value.service.create(command(base))).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_INVALID",
    });
    const created = await value.service.create(
      command({
        ...base,
        companyCodeId: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
        idempotencyKey: "company-config-001",
      }),
    );
    expect(created.request).toMatchObject({
      kind: "configure_company",
      requestedRole: "supplier",
      companyCodeId: "bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb",
      status: "draft",
    });
  });

  it("fails closed on idempotency drift and authorization denial", async () => {
    const value = fixture();
    await value.service.create(command());
    await expect(
      value.service.create(
        command({ proposedPayload: { name: "Different" } }),
      ),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_IDEMPOTENCY_CONFLICT",
      status: 409,
    });
    await expect(
      fixture(false).service.create(command()),
    ).rejects.toBeInstanceOf(MasterDataError);
  });

  it("uses expected versions and organization-scoped update permission", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const updated = await value.service.patch({
      context,
      requestId: created.id,
      expectedVersion: 1,
      proposedPayload: { name: "Acme Ltd" },
    });
    expect(updated).toMatchObject({
      rowVersion: 2,
      proposedPayload: { name: "Acme Ltd" },
    });
    await expect(
      value.service.patch({
        context,
        requestId: created.id,
        expectedVersion: 1,
        proposedPayload: {},
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT",
    });
    expect(value.permissions.at(-1)).toBe(
      "neon.relationship.entity_case.update",
    );
  });

  it("loads a request before applying its organization-scoped read decision", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    value.permissions.length = 0;
    await expect(
      value.service.get({ context, requestId: created.id }),
    ).resolves.toMatchObject({ id: created.id });
    expect(value.permissions).toEqual(["neon.relationship.entity_case.read"]);
  });

  it("loads a review projection with latest validation and workflow coordinates", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "submit-view-001",
    });
    const view = await value.service.getView({
      context,
      requestId: created.id,
    });
    expect(view).toMatchObject({
      request: { status: "pending_approval" },
      workflow: {
        requestId: submitted.workflow.requestId,
        workItemVersion: 1,
        workItemStatus: "open",
      },
    });
    expect(view.validationFindings).toHaveLength(18);
  });

  it("persists a ruleset-pinned validation evaluation and request summaries atomically", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const result = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    expect(result.request).toMatchObject({
      status: "draft",
      rowVersion: 3,
      validationSummary: { outcome: "passed" },
    });
    expect(result.validation).toMatchObject({
      evaluationId: "66666666-6666-4666-8666-666666666666",
      valid: true,
      ruleset: { code: "neon.business_partner.entity_case.phase1", version: 3 },
    });
    expect(result.validation.findings).toHaveLength(18);
    expect(value.repository.validations).toHaveLength(1);
    expect(value.permissions.at(-1)).toBe(
      "neon.relationship.entity_case.validate",
    );
    expect(value.effects.slice(-2)).toEqual([
      "business_partner.case.validated",
      "business_partner.case.validated",
    ]);
  });

  it("lets only the invitation-bound restricted applicant validate and submit their portal proposal", async () => {
    const value = fixture(
      (permission) =>
        permission === "neon.supplier_registration.external.respond",
    );
    const created = await value.repository.create(
      {
        tenantId: context.tenantId,
        requestNo: "BPR-EXTERNAL-001",
        createdBy: context.principalId,
        schema,
        command: {
          idempotencyKey: "external-owned-001",
          kind: "new_partner",
          source: { kind: "portal" },
          registrationMode: "self_service",
          invitationId: "12121212-1212-4121-8121-121212121212",
          applicantPrincipalId: context.principalId,
          requestedRole: "supplier",
          operatingOrganizationId: "55555555-5555-4555-8555-555555555555",
          proposedPayload: {
            relationshipProposals: primaryRelationships,
            name: "Invited Supplier",
            ownershipClass: "external",
            supplierType: "general",
            qualificationTypeCode: "standard",
          },
        },
      },
      {},
    );
    value.permissions.length = 0;
    const other = {
      ...context,
      principalId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    } as VerifiedRequestContext;
    await expect(
      value.service.validate({
        context: other,
        requestId: created.id,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(value.permissions).toEqual([
      "neon.relationship.entity_case.validate",
    ]);
    value.permissions.length = 0;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "external-submit-001",
    });
    expect(submitted.request.status).toBe("pending_approval");
    expect(value.permissions).toEqual([
      "neon.supplier_registration.external.respond",
      "neon.supplier_registration.external.respond",
    ]);
  });

  it("labels duplicate evidence as a deterministic exact-name master lookup", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request,
      validator = createBusinessPartnerRequestValidator({
        duplicates: {
          async findExactName() {
            return [
              {
                id: "10101010-1010-4010-8010-101010101010",
                code: "BP.EXACT",
                name: "Acme",
              },
            ];
          },
        },
        createEvaluationId: () => "67676767-6767-4676-8676-676767676767",
        now: () => new Date("2026-08-28T01:30:00.000Z"),
      });
    const result = await validator.validate(
      {
        context,
        request: {
          ...created,
          proposedPayload: {
            ...created.proposedPayload,
            relationshipProposals: primaryRelationships,
          },
        },
      },
      {},
    );
    expect(result.duplicateSummary).toEqual({
      matchMethod: "exact_name_or_alias_case_insensitive",
      sourceEntity: "master.business_partner",
      sourceField: "name_or_alias",
      scored: false,
      exactNameCandidateCount: 1,
      requiresResolution: true,
      candidates: [
        {
          id: "10101010-1010-4010-8010-101010101010",
          code: "BP.EXACT",
          name: "Acme",
        },
      ],
    });
    expect(result.findings).toContainEqual(
      expect.objectContaining({
        ruleCode: "identity.name.duplicate",
        outcome: "failed",
        severity: "warning",
        evidenceReference: expect.objectContaining({
          matchMethod: "exact_name_or_alias_case_insensitive",
          sourceEntity: "master.business_partner",
        }),
      }),
    );
    expect(result.valid).toBe(true);
  });

  it("moves requests with blocking findings to validation_failed and rejects stale validation", async () => {
    const value = fixture(),
      created = (await value.service.create(command({ proposedPayload: {} })))
        .request;
    const result = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    expect(result.request.status).toBe("validation_failed");
    expect(result.validation.valid).toBe(false);
    expect(result.validation.findings).toContainEqual(
      expect.objectContaining({
        ruleCode: "identity.name.required",
        outcome: "failed",
        severity: "error",
      }),
    );
    await expect(
      value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT",
    });
    expect(value.repository.validations).toHaveLength(1);
  });

  it("requires a qualification type before an external supplier can be submitted", async () => {
    const value = fixture(),
      created = (
        await value.service.create(
          command({
            proposedPayload: {
              name: "External Supplier",
              ownershipClass: "external",
            },
          }),
        )
      ).request;
    const result = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    expect(result.request.status).toBe("validation_failed");
    expect(result.validation.findings).toContainEqual(
      expect.objectContaining({
        ruleCode: "supplier.qualification_type.required",
        fieldPath: "$.qualificationTypeCode",
        outcome: "failed",
        severity: "error",
      }),
    );
  });

  it("requires exactly one primary address and a primary contact with a primary channel", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request,
      validator = createBusinessPartnerRequestValidator({
        duplicates: {
          async findExactName() {
            return [];
          },
        },
        createEvaluationId: () => "67676767-6767-4676-8676-676767676767",
        now: () => new Date("2026-08-28T01:30:00.000Z"),
      });
    const request = {
      ...created,
      proposedPayload: {
        ...created.proposedPayload,
        relationshipProposals: {
          addresses: [{ clientItemKey: "address-1", isPrimary: false }],
          contactPersons: [{ clientItemKey: "contact-1", isPrimary: true }],
          contactChannels: [
            { contactClientItemKey: "contact-1", isPrimary: false },
          ],
        },
      },
    };
    const invalid = await validator.validate({ context, request }, {});
    expect(invalid.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleCode: "relationship.primary_address.required",
          outcome: "failed",
        }),
        expect.objectContaining({
          ruleCode: "relationship.primary_contact.required",
          outcome: "failed",
        }),
      ]),
    );
    const valid = await validator.validate(
      {
        context,
        request: {
          ...request,
          proposedPayload: {
            ...request.proposedPayload,
            relationshipProposals: {
              addresses: [{ clientItemKey: "address-1", isPrimary: true }],
              contactPersons: [{ clientItemKey: "contact-1", isPrimary: true }],
              contactChannels: [
                { contactClientItemKey: "contact-1", isPrimary: true },
              ],
            },
          },
        },
      },
      {},
    );
    expect(
      valid.findings
        .filter((item) => item.ruleCode.startsWith("relationship."))
        .every((item) => item.outcome === "passed"),
    ).toBe(true);
  });

  it("submits a passing request into a pinned workflow and approves it with a distinct maker/checker", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "submit-key-001",
    });
    expect(submitted).toMatchObject({
      replayed: false,
      request: { status: "pending_approval" },
      workflow: {
        definition: { code: "neon.business_partner.onboarding", version: 1 },
      },
    });
    const approverContext = {
      ...context,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assurance: "elevated",
    } as VerifiedRequestContext;
    const decided = await value.service.decide({
      context: approverContext,
      requestId: created.id,
      workflowRequestId: submitted.workflow.requestId,
      workItemId: submitted.workflow.workItemId,
      expectedRequestVersion: submitted.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "approve",
      reason: "Validated onboarding evidence",
      idempotencyKey: "decision-key-001",
    });
    expect(decided).toMatchObject({
      decision: "approve",
      request: { status: "approved", approvedBy: approverContext.principalId },
    });
    expect(value.effects.slice(-4)).toEqual([
      "business_partner.case.submitted",
      "business_partner.case.submitted",
      "business_partner.case.approved",
      "business_partner.case.approved",
    ]);
  });

  it("rejects self approval before persistence", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "submit-key-002",
    });
    await expect(
      value.service.decide({
        context: { ...context, assurance: "elevated" },
        requestId: created.id,
        workflowRequestId: submitted.workflow.requestId,
        workItemId: submitted.workflow.workItemId,
        expectedRequestVersion: submitted.request.rowVersion,
        expectedWorkItemVersion: 1,
        decision: "approve",
        reason: "Invalid self approval",
        idempotencyKey: "decision-key-002",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN",
      status: 403,
    });
  });

  it("reports high-risk decision step-up without weakening the permission", async () => {
    const value = fixture(
        (permission) => permission !== "neon.relationship.entity_case.decide",
        "mfa_required",
      ),
      created = (await value.service.create(command())).request,
      validated = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
      submitted = await value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "submit-mfa-boundary-001",
      }),
      approverContext = {
        ...context,
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      } as VerifiedRequestContext;
    await expect(
      value.service.decide({
        context: approverContext,
        requestId: created.id,
        workflowRequestId: submitted.workflow.requestId,
        workItemId: submitted.workflow.workItemId,
        expectedRequestVersion: submitted.request.rowVersion,
        expectedWorkItemVersion: 1,
        decision: "approve",
        reason: "MFA boundary evidence",
        idempotencyKey: "decision-mfa-boundary-001",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_STEP_UP_REQUIRED",
      status: 403,
      message: expect.stringContaining("MFA verification"),
    });
    expect(value.permissions.at(-1)).toBe(
      "neon.relationship.entity_case.decide",
    );
    expect(value.repository.rows.get(created.id)?.status).toBe(
      "pending_approval",
    );
  });

  it("denies a decision when a previously visible task is reassigned", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request,
      validated = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
      submitted = await value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "submit-owner-boundary-001",
      });
    const approverContext = {
      ...context,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assurance: "elevated",
    } as VerifiedRequestContext;
    expect(
      (
        await value.service.getView({
          context: approverContext,
          requestId: created.id,
        })
      ).workflow,
    ).toMatchObject({
      ownerPrincipalId: approverContext.principalId,
      workItemStatus: "open",
      workItemVersion: 1,
    });
    value.repository.workflowTask = {
      ...value.repository.workflowTask!,
      ownerPrincipalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      workItemVersion: 2,
    };
    await expect(
      value.service.decide({
        context: approverContext,
        requestId: created.id,
        workflowRequestId: submitted.workflow.requestId,
        workItemId: submitted.workflow.workItemId,
        expectedRequestVersion: submitted.request.rowVersion,
        expectedWorkItemVersion: 2,
        decision: "approve",
        reason: "Stale visible assignment",
        idempotencyKey: "decision-owner-boundary-001",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_TASK_OWNER_REQUIRED",
      status: 403,
    });
    expect(value.repository.rows.get(created.id)?.status).toBe(
      "pending_approval",
    );
  });

  it("denies stale, wrong, and closed workflow task coordinates", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request,
      validated = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
      submitted = await value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "submit-task-boundary-001",
      });
    const approverContext = {
        ...context,
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        assurance: "elevated",
      } as VerifiedRequestContext,
      base = {
        context: approverContext,
        requestId: created.id,
        workflowRequestId: submitted.workflow.requestId,
        workItemId: submitted.workflow.workItemId,
        expectedRequestVersion: submitted.request.rowVersion,
        decision: "approve" as const,
        reason: "Task boundary evidence",
      };
    await expect(
      value.service.decide({
        ...base,
        expectedWorkItemVersion: 2,
        idempotencyKey: "decision-stale-task-001",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_TASK_VERSION_CONFLICT",
      status: 409,
    });
    await expect(
      value.service.decide({
        ...base,
        workItemId: "99999999-9999-4999-8999-999999999997",
        expectedWorkItemVersion: 1,
        idempotencyKey: "decision-wrong-task-001",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_TASK_MISMATCH",
      status: 409,
    });
    value.repository.workflowTask!.workItemStatus = "completed";
    await expect(
      value.service.decide({
        ...base,
        expectedWorkItemVersion: 1,
        idempotencyKey: "decision-closed-task-001",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_TASK_NOT_OPEN",
      status: 409,
    });
    expect(value.repository.rows.get(created.id)?.status).toBe(
      "pending_approval",
    );
  });

  it.each([
    ["return", "returned"],
    ["reject", "rejected"],
  ] as const)("persists a %s decision as %s", async (decision, status) => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: `submit-${decision}-001`,
    });
    const approverContext = {
      ...context,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assurance: "elevated",
    } as VerifiedRequestContext;
    const result = await value.service.decide({
      context: approverContext,
      requestId: created.id,
      workflowRequestId: submitted.workflow.requestId,
      workItemId: submitted.workflow.workItemId,
      expectedRequestVersion: submitted.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision,
      reason: `Evidence requires ${decision}`,
      idempotencyKey: `decision-${decision}-001`,
    });
    expect(result.request.status).toBe(status);
    expect(result.decisionFingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it("corrects, revalidates, and resubmits a returned request on its immutable workflow binding", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const first = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "submit-return-cycle-001",
    });
    const approverContext = {
      ...context,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assurance: "elevated",
    } as VerifiedRequestContext;
    const returned = await value.service.decide({
      context: approverContext,
      requestId: created.id,
      workflowRequestId: first.workflow.requestId,
      workItemId: first.workflow.workItemId,
      expectedRequestVersion: first.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "return",
      reason: "Correct the legal name",
      idempotencyKey: "return-cycle-001",
    });
    const corrected = await value.service.patch({
      context,
      requestId: created.id,
      expectedVersion: returned.request.rowVersion,
      proposedPayload: { name: "Acme Corrected" },
    });
    const revalidated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: corrected.rowVersion,
    });
    const second = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: revalidated.request.rowVersion,
      idempotencyKey: "submit-return-cycle-002",
    });
    expect(second.request).toMatchObject({
      status: "pending_approval",
      workflowRequestId: first.workflow.requestId,
    });
    expect(second.request.decisionFingerprint).not.toBe(
      first.request.decisionFingerprint,
    );
  });

  it("opens a new owned task version when a returned case is resubmitted", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request,
      validated = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
      first = await value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: validated.request.rowVersion,
        idempotencyKey: "submit-new-task-001",
      }),
      approverContext = {
        ...context,
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        assurance: "elevated",
      } as VerifiedRequestContext,
      returned = await value.service.decide({
        context: approverContext,
        requestId: created.id,
        workflowRequestId: first.workflow.requestId,
        workItemId: first.workflow.workItemId,
        expectedRequestVersion: first.request.rowVersion,
        expectedWorkItemVersion: 1,
        decision: "return",
        reason: "Correct governed identity",
        idempotencyKey: "return-new-task-001",
      }),
      corrected = await value.service.patch({
        context,
        requestId: created.id,
        expectedVersion: returned.request.rowVersion,
        proposedPayload: { name: "Acme Corrected" },
      }),
      revalidated = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: corrected.rowVersion,
      }),
      second = await value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: revalidated.request.rowVersion,
        idempotencyKey: "submit-new-task-002",
      }),
      view = await value.service.getView({
        context: approverContext,
        requestId: created.id,
      });
    expect(second.workflow.requestId).toBe(first.workflow.requestId);
    expect(second.workflow.workItemId).not.toBe(first.workflow.workItemId);
    expect(view.workflow).toMatchObject({
      workItemId: second.workflow.workItemId,
      workItemVersion: 1,
      workItemStatus: "open",
      ownerPrincipalId: approverContext.principalId,
    });
  });

  it("materializes an approved Phase 1B supplier exactly once and returns stable result coordinates", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "submit-apply-001",
    });
    const approverContext = {
      ...context,
      principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      assurance: "elevated",
    } as VerifiedRequestContext;
    const approved = await value.service.decide({
      context: approverContext,
      requestId: created.id,
      workflowRequestId: submitted.workflow.requestId,
      workItemId: submitted.workflow.workItemId,
      expectedRequestVersion: submitted.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "approve",
      reason: "Approved for supplier onboarding",
      idempotencyKey: "decision-apply-001",
    });
    const applyContext = {
      ...context,
      principalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      assurance: "elevated",
    } as VerifiedRequestContext;
    const first = await value.service.apply({
      context: applyContext,
      requestId: created.id,
      expectedVersion: approved.request.rowVersion,
      idempotencyKey: "application-key-001",
    });
    const second = await value.service.apply({
      context: applyContext,
      requestId: created.id,
      expectedVersion: approved.request.rowVersion,
      idempotencyKey: "application-key-001",
    });
    expect(first).toMatchObject({
      replayed: false,
      request: { status: "applied" },
      materialization: {
        businessPartnerId: "10101010-1010-4010-8010-101010101010",
        supplierId: "11111111-1010-4010-8010-101010101010",
      },
    });
    expect(second).toMatchObject({
      replayed: true,
      materialization: first.materialization,
    });
    expect(value.permissions.at(-1)).toBe(
      "neon.relationship.entity_case.materialize",
    );
    expect(value.effects.slice(-2)).toEqual([
      "business_partner.case.materialized",
      "business_partner.case.materialized",
    ]);
    const event = value.outboxEvents.at(-1)!;
    expect(event["eventKey"]).toBe(
      `business_partner.case.materialized:${created.id}:v${first.request.rowVersion}`,
    );
    expect(event["payload"]).toMatchObject({
      notification: {
        templateKey: "business_partner.case.materialized.v1",
        templateData: { caseNo: "BPR-TEST-001", status: "applied" },
      },
      recipient_principal_ids: [created.createdBy],
    });
  });

  it("returns a materialized aggregate only through the master read permission and organization scope", async () => {
    const value = fixture(),
      created = (await value.service.create(command())).request;
    const row = {
      ...created,
      materializedBusinessPartnerId: "10101010-1010-4010-8010-101010101010",
      materializedSupplierId: "11111111-1010-4010-8010-101010101010",
      materializedOperatingOrganizationAssignmentId:
        "12121212-1010-4010-8010-101010101010",
    };
    value.repository.rows.set(created.id, row);
    const aggregate = await value.service.getAggregate({
      context,
      businessPartnerId: row.materializedBusinessPartnerId,
      operatingOrganizationId: created.operatingOrganizationId!,
    });
    expect(aggregate).toMatchObject({
      businessPartner: { code: "BP.TEST" },
      suppliers: [{ supplierCode: "SUP.TEST" }],
    });
    expect(value.permissions.at(-1)).toBe(
      "neon.relationship.business_partner.read",
    );
    await expect(
      value.service.getAggregate({
        context,
        businessPartnerId: row.materializedBusinessPartnerId,
        operatingOrganizationId: "55555555-5555-4555-8555-000000000000",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_NOT_FOUND",
      status: 404,
    });
  });

  it.each([
    ["BP-SUP-002", "add_supplier", "supplier"],
    ["BP-SUP-003", "add_supplier", "supplier"],
    ["BP-CUS-002", "add_customer", "customer"],
    ["BP-CUS-003", "add_customer", "customer"],
  ] as const)(
    "%s materializes only the approved role against the target identity",
    async (scenario, kind, role) => {
      const value = fixture(),
        targetBusinessPartnerId = "10101010-1010-4010-8010-101010101010",
        created = (
          await value.service.create(
            command({
              idempotencyKey: `${scenario.toLowerCase()}-create`,
              kind,
              targetBusinessPartnerId,
              requestedRole: role,
              proposedPayload:
                role === "supplier"
                  ? {
                      ownershipClass: "external",
                      qualificationTypeCode: "standard",
                      supplierCode: `SUP.${scenario.replaceAll("-", "")}`,
                      supplierType: "general",
                    }
                  : {
                      ownershipClass: "external",
                      customerCode: `CUS.${scenario.replaceAll("-", "")}`,
                      customerType: "corporate",
                    },
            }),
          )
        ).request,
        validated = await value.service.validate({
          context,
          requestId: created.id,
          expectedVersion: 1,
        }),
        submitted = await value.service.submit({
          context,
          requestId: created.id,
          expectedVersion: validated.request.rowVersion,
          idempotencyKey: `${scenario.toLowerCase()}-submit`,
        }),
        approverContext = {
          ...context,
          principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          assurance: "elevated",
        } as VerifiedRequestContext,
        approved = await value.service.decide({
          context: approverContext,
          requestId: created.id,
          workflowRequestId: submitted.workflow.requestId,
          workItemId: submitted.workflow.workItemId,
          expectedRequestVersion: submitted.request.rowVersion,
          expectedWorkItemVersion: 1,
          decision: "approve",
          reason: `${scenario} independently approved`,
          idempotencyKey: `${scenario.toLowerCase()}-decide`,
        }),
        applied = await value.service.apply({
          context: {
            ...context,
            principalId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            assurance: "elevated",
          } as VerifiedRequestContext,
          requestId: created.id,
          expectedVersion: approved.request.rowVersion,
          idempotencyKey: `${scenario.toLowerCase()}-apply`,
        });
      expect(applied.materialization).toMatchObject({
        businessPartnerId: targetBusinessPartnerId,
        partnerRole: role,
      });
      expect(applied.request.materializedBusinessPartnerId).toBe(
        targetBusinessPartnerId,
      );
      if (role === "supplier") {
        expect(applied.request.materializedSupplierId).toBeDefined();
        expect(applied.request.materializedCustomerId).toBeUndefined();
      } else {
        expect(applied.request.materializedCustomerId).toBeDefined();
        expect(applied.request.materializedSupplierId).toBeUndefined();
      }
    },
  );

  it("rejects mismatched add-role request kinds before authorization", async () => {
    const value = fixture();
    await expect(
      value.service.create(
        command({
          kind: "add_customer",
          targetBusinessPartnerId: "10101010-1010-4010-8010-101010101010",
          requestedRole: "supplier",
        }),
      ),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_INVALID",
      status: 400,
    });
    expect(value.permissions).toEqual([]);
  });
});

it.each(["invalid", "2026-13-01", "2026-02-30", "infinity"])(
  "rejects invalid case list timestamp %s before querying",
  async (beforeCreatedAt) => {
    const value = fixture();
    await expect(
      value.service.list({
        context,
        operatingOrganizationId: "55555555-5555-4555-8555-555555555555",
        beforeCreatedAt,
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "BUSINESS_PARTNER_REQUEST_INVALID",
    });
    expect(value.permissions).toHaveLength(0);
  },
);

it("BP-AI-07: authorizes current scope, pins version, and never exposes the owner baseline DTO", async () => {
  const value = fixture();
  const { request } = await value.service.create(command());
  vi.spyOn(value.repository, "getView").mockResolvedValue({
    request,
    validationFindings: [],
    snapshotId: "saved",
    validationCurrent: false,
    previousSnapshot: {
      id: "prior",
      revision: 1,
      payload: { bankAccount: "protected-baseline" },
    },
  } as never);
  const result = await value.service.explainCase!({
    context,
    requestId: request.id,
    expectedVersion: request.rowVersion,
  });
  expect(result).toMatchObject({
    caseId: request.id,
    rowVersion: request.rowVersion,
    validation: "not_evaluated",
    coverage: "partial",
  });
  expect(JSON.stringify(result)).not.toContain("protected-baseline");
  expect(
    await value.service.getView({ context, requestId: request.id }),
  ).not.toHaveProperty("previousSnapshot");
  await expect(
    value.service.explainCase!({
      context,
      requestId: request.id,
      expectedVersion: request.rowVersion + 1,
    }),
  ).rejects.toMatchObject({
    code: "BUSINESS_PARTNER_REQUEST_VERSION_CONFLICT",
  });
  await expect(
    value.service.explainCase!({
      context,
      requestId: request.id,
      businessPartnerId: "unrelated",
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(value.repository.submissionCount).toBe(0);
});
it("BP-AI-07: rejects revoked case access before explaining saved evidence", async () => {
  let allowed = true;
  const value = fixture(() => allowed);
  const { request } = await value.service.create(command());
  allowed = false;
  await expect(
    value.service.explainCase!({ context, requestId: request.id }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
});

it("requires authority over the stored child before changing its organization", async () => {
  let restrict = false;
  const source = "55555555-5555-4555-8555-555555555555",
    target = "77777777-7777-4777-8777-777777777777";
  const value = fixture(
    (_permission, resource) =>
      !restrict || resource?.["operatingOrganizationId"] === target,
  );
  const created = (await value.service.create(command())).request;
  restrict = true;
  await expect(
    value.service.patch({
      context,
      requestId: created.id,
      expectedVersion: 1,
      proposedPayload: { name: "Moved" },
      operatingOrganizationId: target,
    }),
  ).rejects.toMatchObject({ code: "FORBIDDEN" });
  expect(value.repository.rows.get(created.id)?.operatingOrganizationId).toBe(
    source,
  );
});
it("authorizes each independently scoped case in a list", async () => {
  let restrict = false;
  const value = fixture(
    (_permission, resource) =>
      !restrict || resource?.["recordId"] === undefined,
  );
  await value.service.create(command());
  restrict = true;
  expect(
    await value.service.list({
      context,
      operatingOrganizationId: "55555555-5555-4555-8555-555555555555",
    }),
  ).toEqual([]);
});

describe("commercial role ownership validation", () => {
  it.each([
    ["supplier", "internal", "general"],
    ["customer", "internal", "corporate"],
    ["supplier", "external", "intercompany"],
    ["customer", "external", "intercompany"],
  ] as const)(
    "rejects %s %s/%s before workflow submission",
    async (role, ownership, subtype) => {
      const value = fixture();
      const created = (
        await value.service.create(
          command({
            requestedRole: role,
            proposedPayload: {
              name: "Invalid ownership",
              ownershipClass: ownership,
              [role === "supplier" ? "supplierType" : "customerType"]: subtype,
              qualificationTypeCode: "standard",
            },
          }),
        )
      ).request;
      const validation = await value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: created.rowVersion,
      });
      expect(validation.validation.valid).toBe(false);
      expect(validation.validation.findings).toContainEqual(
        expect.objectContaining({
          ruleCode: "role.ownership_subtype.compatible",
          outcome: "failed",
          severity: "error",
        }),
      );
      await expect(
        value.service.submit({
          context,
          requestId: created.id,
          expectedVersion: validation.request.rowVersion,
          idempotencyKey: "invalid-role-submit",
        }),
      ).rejects.toMatchObject({
        code: "BUSINESS_PARTNER_REQUEST_NOT_SUBMITTABLE",
      });
      expect(value.repository.submissionCount).toBe(0);
    },
  );
  it("rechecks legacy passed validation before opening an approval workflow", async () => {
    const value = fixture();
    const created = (await value.service.create(command())).request;
    const payload = { ...created.proposedPayload };
    delete payload["supplierType"];
    value.repository.rows.set(created.id, {
      ...created,
      proposedPayload: payload,
      validationSummary: { outcome: "passed" },
    });
    await expect(
      value.service.submit({
        context,
        requestId: created.id,
        expectedVersion: 1,
        idempotencyKey: "legacy-validation-submit",
      }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_SUBMISSION_VALIDATION_FAILED",
    });
    expect(value.repository.submissionCount).toBe(0);
  });
});

it("rejects missing relationship proposals before approval", async () => {
  const value = fixture(),
    created = (await value.service.create(command())).request;
  const payload = { ...created.proposedPayload };
  payload["relationshipProposals"] = null;
  value.repository.rows.set(created.id, {
    ...created,
    proposedPayload: payload,
  });
  const result = await value.service.validate({
    context,
    requestId: created.id,
    expectedVersion: 1,
  });
  expect(result.validation.valid).toBe(false);
  expect(result.validation.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        ruleCode: "relationship.primary_address.required",
        outcome: "failed",
      }),
      expect.objectContaining({
        ruleCode: "relationship.primary_contact.required",
        outcome: "failed",
      }),
    ]),
  );
  await expect(
    value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: result.request.rowVersion,
      idempotencyKey: "missing-relationships",
    }),
  ).rejects.toMatchObject({ code: "BUSINESS_PARTNER_REQUEST_NOT_SUBMITTABLE" });
});

describe("Company-owned setup lifecycle", () => {
  const companyCodeId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const setupCommand = () =>
    command({
      kind: "configure_company",
      companyCodeId,
      targetBusinessPartnerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });
  it("runs the shared governed lifecycle with independent company permissions", async () => {
    const value = fixture(
      (permission, resource) =>
        permission.startsWith("neon.relationship.bp_company_setup_request.") &&
        resource?.entityCode ===
          "master.business_partner_company_setup_request" &&
        resource?.companyCodeId === companyCodeId,
      "denied",
      true,
    );
    const created = (await value.service.create(setupCommand())).request;
    const validated = await value.service.validate({
      context,
      requestId: created.id,
      expectedVersion: 1,
    });
    expect(validated.validation.valid).toBe(true);
    const submitted = await value.service.submit({
      context,
      requestId: created.id,
      expectedVersion: validated.request.rowVersion,
      idempotencyKey: "company-submit-001",
    });
    const decision = {
      requestId: created.id,
      workflowRequestId: submitted.workflow.requestId,
      workItemId: submitted.workflow.workItemId,
      expectedRequestVersion: submitted.request.rowVersion,
      expectedWorkItemVersion: 1,
      decision: "approve" as const,
      reason: "Independent company review",
      idempotencyKey: "company-decide-001",
    };
    await expect(
      value.service.decide({ ...decision, context }),
    ).rejects.toMatchObject({
      code: "BUSINESS_PARTNER_REQUEST_SELF_APPROVAL_FORBIDDEN",
    });
    const approved = await value.service.decide({
      ...decision,
      context: {
        ...context,
        principalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        assurance: "elevated",
      },
    });
    const applied = await value.service.apply({
      context: { ...context, assurance: "elevated" },
      requestId: created.id,
      expectedVersion: approved.request.rowVersion,
      idempotencyKey: "company-apply-001",
    });
    expect(applied.request.status).toBe("applied");
    expect(value.permissions).toContain(
      "neon.relationship.bp_company_setup_request.materialize",
    );
    expect(
      value.permissions.every((permission) =>
        permission.startsWith("neon.relationship.bp_company_setup_request."),
      ),
    ).toBe(true);
  });
  it("rejects a wrong-company request and does not inherit parent BP read", async () => {
    const value = fixture(
      (permission, resource) =>
        permission === "neon.relationship.business_partner.read" ||
        resource?.companyCodeId === companyCodeId,
      "denied",
      true,
    );
    await expect(
      value.service.create({
        ...setupCommand(),
        companyCodeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(value.repository.rows.size).toBe(0);
    await expect(value.service.create(command())).rejects.toMatchObject({
      code: "BP_COMPANY_PILOT_COMMAND_INVALID",
    });
    await expect(
      value.service.list({ context, operatingOrganizationId: "org" }),
    ).rejects.toMatchObject({ code: "BP_COMPANY_PILOT_COMPANY_REQUIRED" });
  });
  it("rechecks access after reading before lifecycle execution", async () => {
    let allowed = true;
    const value = fixture(() => allowed, "denied", true),
      created = (await value.service.create(setupCommand())).request;
    expect(
      (await value.service.get({ context, requestId: created.id })).id,
    ).toBe(created.id);
    allowed = false;
    await expect(
      value.service.validate({
        context,
        requestId: created.id,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      value.service.get({ context, requestId: created.id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(value.repository.rows.get(created.id)?.rowVersion).toBe(1);
  });
});

it("saves incomplete internal capture but cannot submit it as a completed bank account",async()=>{
 const value=fixture();
 const extensions={bankAccounts:[{clientItemKey:"bank-1",definitionFieldCode:"bank_accounts",accountHolderName:"Example"}]};
 const created=await value.service.create(command({draftCapture:true,extensions}));
 // The SQL repository stores extensions beneath relationshipProposals in its snapshot.
 value.repository.rows.set(created.request.id,{...created.request,proposedPayload:{...created.request.proposedPayload,relationshipProposals:extensions}});
 await expect(value.service.submit({context,requestId:created.request.id,expectedVersion:created.request.rowVersion,idempotencyKey:"submit-incomplete-bank"})).rejects.toMatchObject({code:"REQUEST_CAPTURE_INVALID"});
 expect(value.repository.submissionCount).toBe(0);
});

it("does not emit duplicate save effects when the repository returns the exact replayed draft",async()=>{
 const value=fixture();
 const created=await value.service.create(command({draftCapture:true}));
 const current={...created.request,rowVersion:2};
 value.repository.rows.set(current.id,current);
 vi.spyOn(value.repository,"patch").mockResolvedValue(current);
 const before=[...value.effects];
 const result=await value.service.patch({context,requestId:current.id,expectedVersion:1,draftCapture:true,proposedPayload:current.proposedPayload});
 expect(result.rowVersion).toBe(2);
 expect(value.effects).toEqual(before);
});

it("identifies the update operation without treating unchanged ownership as reassignment",async()=>{
 const checked:Readonly<Record<string,unknown>>[]=[];
 const value=fixture((permission,resource)=>{
  if(permission!=="neon.relationship.entity_case.update")return true;
  checked.push(resource??{});return resource?.operationKey==="update"&&resource?.entityCode==="entity_case";
 });
 const created=(await value.service.create(command({draftCapture:true}))).request;
 await value.service.patch({context,requestId:created.id,expectedVersion:created.rowVersion,draftCapture:true,proposedPayload:{name:"Updated draft"}});
 expect(checked.map(scope=>scope.authorizationTarget)).toEqual(["existing"]);
 checked.length=0;
 await value.service.patch({context,requestId:created.id,expectedVersion:2,draftCapture:true,operatingOrganizationId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",proposedPayload:{name:"Reassigned draft"}});
 expect(checked.map(scope=>scope.authorizationTarget)).toEqual(["existing","proposed"]);
});
