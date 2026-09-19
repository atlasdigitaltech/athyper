import type {
  Authorizer,
  VerifiedRequestContext,
} from "@athyper/server-contract-auth";
import { randomUUID } from "node:crypto";
import type {
  BusinessPartnerRequestService,
  CreateBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import { businessPartnerRequestPermissions } from "@athyper/server-contract-master-data";
import {
  createBusinessPartnerRequestService,
  type BusinessPartnerRequestServiceOptions,
} from "./business-partner-request-service.js";
import { MasterDataError } from "./errors.js";

export const BP_COMPANY_PILOT_ENTITY = "business_partner_company_setup_request";
export const BP_COMPANY_PILOT_CASE_ENTITY =
  `master.${BP_COMPANY_PILOT_ENTITY}` as const;
export const BP_COMPANY_PILOT_PERMISSION_PREFIX =
  "neon.relationship.bp_company_setup_request.";

export interface CompanyPilotScopeRequest {
  readonly context: VerifiedRequestContext;
  readonly target: "existing" | "proposed" | "collection";
  readonly recordId?: string;
  readonly coordinates: {
    readonly companyCodeId?: string;
    readonly operatingOrganizationId?: string;
  };
}

/** Separate company authority, sharing only the governed lifecycle implementation.
 * The supplied repository must be pinned to BP_COMPANY_PILOT_CASE_ENTITY.
 * Publication/ownership resolution is mandatory and never falls back to BP read.
 */
export function createBusinessPartnerCompanyPilotService<Transaction>(
  options: BusinessPartnerRequestServiceOptions<Transaction> & {
    readonly refreshContext: (
      context: VerifiedRequestContext,
    ) => Promise<VerifiedRequestContext>;
    readonly resolveScope: (
      request: CompanyPilotScopeRequest,
    ) => Promise<{ readonly companyCodeId: string } | null>;
    readonly requirePublishedOperation: (
      context: VerifiedRequestContext,
      operation: string,
      permission: string,
    ) => Promise<void>;
  },
): BusinessPartnerRequestService {
  const authority: Authorizer = {
    async authorize(request) {
      const operation = Object.values(
        businessPartnerRequestPermissions,
      ).includes(request.permissionCode as never)
        ? request.resource?.["operationKey"] === "discover"
          ? "discover"
          : request.permissionCode.split(".").at(-1)!
        : undefined;
      // A company case does not grant aggregate/parent reads or portal actions.
      if (!operation)
        return {
          allowed: false,
          reason: "company_pilot_operation_unsupported",
        };
      const context = await options.refreshContext(request.context);
      if (
        context.tenantId !== request.context.tenantId ||
        context.principalId !== request.context.principalId ||
        context.planeKey !== "neon" ||
        context.realmKey !== request.context.realmKey ||
        context.authEpoch !== request.context.authEpoch
      )
        return { allowed: false, reason: "company_pilot_identity_changed" };
      const resource = request.resource ?? {};
      const target =
        resource["authorizationTarget"] === "proposed"
          ? "proposed"
          : operation === "discover"
            ? "collection"
            : "existing";
      const recordId =
        typeof resource["recordId"] === "string"
          ? resource["recordId"]
          : undefined;
      const coordinates = {
        ...(typeof resource["companyCodeId"] === "string"
          ? { companyCodeId: resource["companyCodeId"] }
          : {}),
        ...(typeof resource["operatingOrganizationId"] === "string"
          ? { operatingOrganizationId: resource["operatingOrganizationId"] }
          : {}),
      };
      const resolved = await options.resolveScope({
        context,
        target,
        ...(recordId ? { recordId } : {}),
        coordinates,
      });
      if (!resolved)
        return { allowed: false, reason: "company_pilot_scope_invalid" };
      if (target === "proposed" && recordId) {
        const owner = await options.resolveScope({
          context,
          target: "existing",
          recordId,
          coordinates: {},
        });
        if (!owner || owner.companyCodeId !== resolved.companyCodeId)
          return { allowed: false, reason: "company_pilot_owner_immutable" };
      }
      const permissionCode =
        BP_COMPANY_PILOT_PERMISSION_PREFIX +
        (operation === "discover" ? "read" : operation);
      await options.requirePublishedOperation(
        context,
        operation,
        permissionCode,
      );
      const {
        operatingOrganizationId: _organization,
        companyCodeId: _company,
        ...facts
      } = resource;
      return options.authorizer.authorize({
        ...request,
        context,
        permissionCode,
        observation: {
          entityCode: BP_COMPANY_PILOT_ENTITY,
          surface: "command",
          phase:
            operation === "read" || operation === "discover"
              ? "discover"
              : "execute",
        },
        resource: {
          ...facts,
          tenantId: context.tenantId,
          entityCode: BP_COMPANY_PILOT_CASE_ENTITY,
          resourceCode: BP_COMPANY_PILOT_ENTITY,
          operationKey: operation,
          companyCodeId: resolved.companyCodeId,
        },
      });
    },
  };
  const service = createBusinessPartnerRequestService({
    ...options,
    authorizer: authority,
    createRequestNo:
      options.createRequestNo ??
      (() => `BPC-${randomUUID().replaceAll("-", "").toUpperCase()}`),
  });
  const validate = (command: CreateBusinessPartnerRequestCommand) => {
    if (
      command.kind !== "configure_company" ||
      command.source.kind !== "manual" ||
      !command.companyCodeId ||
      !command.operatingOrganizationId ||
      !command.targetBusinessPartnerId
    )
      throw new MasterDataError(
        400,
        "BP_COMPANY_PILOT_COMMAND_INVALID",
        "Company setup requires a manual configure_company request with company, organization and target BP",
      );
  };
  return {
    ...service,
    async preflightCreate(command) {
      validate(command);
      return service.preflightCreate!(command);
    },
    async create(command) {
      validate(command);
      return service.create(command);
    },
    async list(query) {
      if (!query.companyCodeId)
        throw new MasterDataError(
          409,
          "BP_COMPANY_PILOT_COMPANY_REQUIRED",
          "Select the owning company",
        );
      return service.list(query);
    },
    async getAggregate() {
      throw new MasterDataError(
        403,
        "BP_COMPANY_PILOT_OPERATION_UNSUPPORTED",
        "Company setup authority does not include BP aggregate access",
      );
    },
  };
}
