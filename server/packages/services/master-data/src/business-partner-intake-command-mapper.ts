import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import {
  type BusinessPartnerRequest,
  type BusinessPartnerRequestService,
  type CreateBusinessPartnerRequestCommand,
  type PatchBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import {
  dataSurfaceValues,
  type EntityIntakeOperationRequestV1,
  type EntityIntakeSurfaceV1,
  type EntityIntakeFlowV1,
  type EntityIntakePolicyPreviewV1,
} from "@athyper/contract-platform-entity-runtime";
import {
  buildRelationshipExtensions,
  buildProfileExtensions,
  type AddressDraft,
  type ContactDraft,
} from "@athyper/contract-neon-party";
import { supplierRequirementSurface } from "./business-partner-intake-profile.js";
import { MasterDataError } from "./errors.js";
import type { BusinessPartnerIntakeCommandMapper } from "./business-partner-intake-operation-provider.js";

type Input = {
  context: VerifiedRequestContext;
  request: EntityIntakeOperationRequestV1;
};
type Descriptor = {
  revision: { descriptorHash: string };
  intakeSurfaces?: readonly EntityIntakeSurfaceV1[];
  intakeFlows?: readonly EntityIntakeFlowV1[];
};
function fail(
  code: string,
  message: string,
  status: 400 | 403 | 409 | 503 = 400,
): never {
  throw new MasterDataError(status, code, message);
}
const uuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );

/** Answers are data only. The current server descriptor supplies every path,
 * collection and choice; the owning request service retains mutation authority. */
export function createBusinessPartnerIntakeCommandMapper(options: {
  descriptor(context: VerifiedRequestContext): Promise<Descriptor>;
  requests: Pick<BusinessPartnerRequestService, "get">;
  readPartner(context: VerifiedRequestContext, id: string): Promise<unknown>;
  protect(
    context: VerifiedRequestContext,
    organizationId: string,
    kind: "tax" | "certificate" | "bank",
    value: string,
    bank?: { bankCountryCode: string; accountIdType: string },
  ): Promise<{
    protectedValueToken: string;
    valueHash: string;
    maskedValue: string;
  }>;
  preview(
    command: PatchBusinessPartnerRequestCommand,
    current: BusinessPartnerRequest,
  ): Promise<EntityIntakePolicyPreviewV1>;
}): BusinessPartnerIntakeCommandMapper {
  async function admit(input: Input) {
    if (input.context.planeKey !== "neon")
      fail("ENTITY_INTAKE_FORBIDDEN", "Intake belongs to Neon", 403);
    const descriptor = await options.descriptor(input.context);
    if (descriptor.revision.descriptorHash !== input.request.descriptorHash)
      fail(
        "ENTITY_INTAKE_DESCRIPTOR_CHANGED",
        "Reload the published intake form",
        409,
      );
    const flow = descriptor.intakeFlows?.find(
      (f) => f.key === input.request.flowKey,
    );
    if (!flow || flow.key !== "request_intake")
      fail(
        "ENTITY_INTAKE_FLOW_UNAVAILABLE",
        "The published intake flow is unavailable",
        503,
      );
    const surfaces = descriptor.intakeSurfaces ?? [];
    const details = surfaces.find((s) => s.key === "intake_details");
    const partner = surfaces.find((s) => s.key === "intake_partner");
    if (!details || !partner)
      fail(
        "ENTITY_INTAKE_SURFACE_UNAVAILABLE",
        "The published intake form is unavailable",
        503,
      );
    const current = input.request.requestId
      ? await options.requests.get({
          context: input.context,
          requestId: input.request.requestId,
        })
      : undefined;
    if (
      current &&
      input.request.expectedVersion !== undefined &&
      current.rowVersion !== input.request.expectedVersion
    )
      fail("ENTITY_INTAKE_VERSION_CHANGED", "Reload the current request", 409);
    const allowed = new Set(
      [...details.sections, ...partner.sections].flatMap((s) =>
        s.fields.map((f) => ("valueKey" in f ? f.valueKey : f.key)),
      ),
    );
    if (Object.keys(input.request.answers).some((k) => !allowed.has(k)))
      fail(
        "ENTITY_INTAKE_UNDECLARED_ANSWER",
        "An answer is not declared by the published form",
      );
    const roleField = partner.sections
      .flatMap((s) => s.fields)
      .find((f) => f.key === "requested_role");
    const role = input.request.answers.requested_role ?? current?.requestedRole;
    if (
      (role !== "supplier" && role !== "customer") ||
      roleField?.control !== "choiceCards" ||
      !roleField.options.some((o) => o.value === role)
    )
      fail("ENTITY_INTAKE_ROLE_INVALID", "Choose a published partner role");
    const lookup = partner.sections
      .flatMap((s) => s.fields)
      .find((f) => f.control === "entityLookup");
    const target =
      (lookup ? input.request.answers[lookup.key] : undefined) ??
      current?.targetBusinessPartnerId;
    if (target !== undefined && target !== "new") {
      if (!uuid(target))
        fail("ENTITY_INTAKE_TARGET_INVALID", "Choose a valid partner");
      await options.readPartner(input.context, target);
    }
    if (
      current &&
      (role !== current.requestedRole ||
        (target === "new" ? undefined : target) !==
          current.targetBusinessPartnerId)
    )
      fail(
        "ENTITY_INTAKE_SELECTION_CHANGED",
        "A saved request cannot change its role or partner selection",
        409,
      );
    return {
      details: supplierRequirementSurface(details, role),
      surfaces,
      role: role as "supplier" | "customer",
      target: target === "new" ? undefined : target,
      current,
    };
  }
  async function mapped(input: Input, previewOnly = false) {
    const admitted = await admit(input);
    // Supply absent optional collections as empty only for a new draft. Existing
    // draft answers are complete snapshots from the published renderer.
    const answers = { ...input.request.answers };
    for (const f of admitted.details.sections.flatMap((s) => s.fields))
      if (
        f.control === "repeatableGroup" &&
        answers[f.valueKey] === undefined
      ) {
        if (admitted.current)
          fail(
            "ENTITY_INTAKE_INCOMPLETE_DRAFT",
            "Restore all saved collections before saving",
          );
        answers[f.valueKey] = [];
      }
    let values: Readonly<Record<string, unknown>>;
    try {
      values = dataSurfaceValues(
        admitted.details,
        admitted.surfaces,
        answers,
        "draft",
      );
    } catch {
      return fail(
        "ENTITY_INTAKE_ANSWERS_INVALID",
        "Correct the invalid intake fields",
      );
    }
    const proposed: Record<string, unknown> = admitted.current
      ? Object.fromEntries(
          Object.entries(admitted.current.proposedPayload).filter(
            ([k]) => k !== "relationshipProposals",
          ),
        )
      : { partnerCategory: "organization" };
    const tenantFields: Record<string, unknown> = {};
    let organizationId = admitted.current?.operatingOrganizationId;
    let companyCodeId = admitted.current?.companyCodeId;
    for (const field of admitted.details.sections.flatMap((s) => s.fields)) {
      if (field.control !== "input" || !field.payload) continue;
      const value = values[field.valueKey];
      if (field.payload.target === "context") {
        if (
          field.payload.path === "operatingOrganizationId" &&
          value !== undefined
        )
          organizationId = String(value);
        if (field.payload.path === "companyCodeId" && value !== undefined)
          companyCodeId = String(value);
      } else if (field.payload.target === "canonical") {
        if (value !== undefined) proposed[field.payload.path] = value;
        else if (
          admitted.current &&
          Object.hasOwn(proposed, field.payload.path)
        )
          proposed[field.payload.path] = null;
      } else if (value !== undefined) tenantFields[field.payload.path] = value;
    }
    if (
      !uuid(organizationId) ||
      (companyCodeId !== undefined && !uuid(companyCodeId))
    )
      fail(
        "ENTITY_INTAKE_CONTEXT_REQUIRED",
        "Choose a valid organization and company context",
      );
    proposed.tenantFields = tenantFields;
    const previous = admitted.current?.proposedPayload.relationshipProposals as
      Record<string, readonly Record<string, unknown>[]> | undefined;
    const extensions = {
      ...(await buildRelationshipExtensions(
        (values.addresses ?? []) as readonly AddressDraft[],
        (values.contacts ?? []) as readonly ContactDraft[],
      )),
      ...(await buildProfileExtensions(
        admitted.details,
        values,
        (kind, value, bank) => {
          if (previewOnly)
            fail(
              "ENTITY_INTAKE_PROTECTED_PREVIEW_REQUIRES_SAVE",
              "Save changed protected values before previewing the request",
              409,
            );
          return options.protect(
            input.context,
            organizationId!,
            kind,
            value,
            bank,
          );
        },
        admitted.surfaces,
        previous,
      )),
    };
    return {
      ...admitted,
      proposedPayload: proposed,
      extensions:
        extensions as unknown as CreateBusinessPartnerRequestCommand["extensions"],
      operatingOrganizationId: organizationId,
      ...(companyCodeId ? { companyCodeId } : {}),
    };
  }
  async function patch(
    input: Input & { requestId: string; expectedVersion: number },
    previewOnly = false,
  ): Promise<PatchBusinessPartnerRequestCommand> {
    const m = await mapped(input, previewOnly);
    return {
      context: input.context,
      requestId: input.requestId,
      expectedVersion: input.expectedVersion,
      draftCapture: m.current?.kind === "new_partner",
      proposedPayload: m.proposedPayload,
      extensions: m.extensions,
      operatingOrganizationId: m.operatingOrganizationId,
      ...(m.companyCodeId ? { companyCodeId: m.companyCodeId } : {}),
    };
  }
  return {
    async admit(input) {
      await admit(input);
    },
    async create(input) {
      const m = await mapped(input);
      return {
        context: input.context,
        idempotencyKey: input.idempotencyKey,
        source: { kind: "manual" },
        draftCapture: !m.target,
        kind: m.target
          ? m.role === "supplier"
            ? "add_supplier"
            : "add_customer"
          : "new_partner",
        requestedRole: m.role,
        ...(m.target ? { targetBusinessPartnerId: String(m.target) } : {}),
        operatingOrganizationId: m.operatingOrganizationId,
        ...(m.companyCodeId ? { companyCodeId: m.companyCodeId } : {}),
        proposedPayload: m.proposedPayload,
        extensions: m.extensions,
      };
    },
    patch,
    async preview(input) {
      const m = await admit(input);
      if (!m.current) return { outcome: "unchanged" };
      if (!input.request.expectedVersion)
        fail(
          "ENTITY_INTAKE_VERSION_REQUIRED",
          "An expected request version is required",
          409,
        );
      return options.preview(
        await patch(
          {
            ...input,
            requestId: m.current.id,
            expectedVersion: input.request.expectedVersion,
          },
          true,
        ),
        m.current,
      );
    },
  };
}
