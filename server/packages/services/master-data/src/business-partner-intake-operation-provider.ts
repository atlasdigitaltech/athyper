import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  EntityIntakeOperationRequestV1,
  EntityIntakeOperationResponseV1,
  EntityIntakePolicyPreviewV1,
} from "@athyper/contract-platform-entity-runtime";
import type {
  BusinessPartnerRequestService,
  CreateBusinessPartnerRequestCommand,
  PatchBusinessPartnerRequestCommand,
} from "@athyper/server-contract-master-data";
import { MasterDataError } from "./errors.js";

/**
 * Server-only BP adapter. The mapper is intentionally injected: it is where
 * protected-value tokens, relationship extensions, and published-surface
 * payload paths are resolved before the governed service is invoked.
 */
export interface BusinessPartnerIntakeCommandMapper {
  admit(input: {
    readonly context: VerifiedRequestContext;
    readonly request: EntityIntakeOperationRequestV1;
  }): Promise<void>;
  create(input: {
    readonly context: VerifiedRequestContext;
    readonly request: EntityIntakeOperationRequestV1;
    readonly idempotencyKey: string;
  }): Promise<CreateBusinessPartnerRequestCommand>;
  patch(input: {
    readonly context: VerifiedRequestContext;
    readonly request: EntityIntakeOperationRequestV1;
    readonly requestId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
  }): Promise<PatchBusinessPartnerRequestCommand>;
  preview?(input: {
    readonly context: VerifiedRequestContext;
    readonly request: EntityIntakeOperationRequestV1;
  }): Promise<EntityIntakePolicyPreviewV1>;
}

export function createBusinessPartnerIntakeOperationProvider(options: {
  readonly requests: Pick<
    BusinessPartnerRequestService,
    "create" | "patch" | "submit"
  >;
  readonly mapper: BusinessPartnerIntakeCommandMapper;
}) {
  return Object.freeze({
    async execute(input: {
      readonly context: VerifiedRequestContext;
      readonly request: EntityIntakeOperationRequestV1;
      readonly idempotencyKey: string;
    }): Promise<EntityIntakeOperationResponseV1> {
      const { request } = input;
      await options.mapper.admit(input);
      if (
        request.operation === "preview" ||
        request.operation === "selection"
      ) {
        const policyPreview = await options.mapper.preview?.({
          context: input.context,
          request,
        });
        return response(undefined, policyPreview, request.requestId);
      }
      if (request.operation === "save_draft") {
        const result = request.requestId
          ? await options.requests.patch(
              await options.mapper.patch({
                context: input.context,
                request,
                requestId: request.requestId,
                expectedVersion: version(request),
                idempotencyKey: input.idempotencyKey,
              }),
            )
          : await options.requests.create(
              await options.mapper.create({
                context: input.context,
                request,
                idempotencyKey: input.idempotencyKey,
              }),
            );
        const saved = "request" in result ? result.request : result;
        return response(saved, undefined, saved.id);
      }
      if (request.operation === "submit") {
        if (!request.requestId)
          throw new MasterDataError(
            400,
            "ENTITY_INTAKE_REQUEST_REQUIRED",
            "A saved intake request is required before submission",
          );
        const result = await options.requests.submit({
          context: input.context,
          requestId: request.requestId,
          expectedVersion: version(request),
          idempotencyKey: input.idempotencyKey,
        });
        const submitted = response(
          result.request,
          undefined,
          result.request.id,
        );
        return {
          ...submitted,
          receipt: { ...submitted.receipt, statusLabel: "Submitted" },
          capabilities: [
            {
              operation: "exit" as const,
              operationKey: "exit",
              label: "Exit",
              href: "/mdg/business-partner/manage",
            },
          ],
        };
      }
      // Undo and discard need a published operation handler. They are absent
      // from capabilities until that handler is registered.
      throw new MasterDataError(
        400,
        "ENTITY_INTAKE_OPERATION_UNAVAILABLE",
        "This intake operation is not published",
      );
    },
  });
}

function version(request: EntityIntakeOperationRequestV1) {
  if (
    !Number.isSafeInteger(request.expectedVersion) ||
    request.expectedVersion! < 1
  )
    throw new MasterDataError(
      409,
      "ENTITY_INTAKE_VERSION_REQUIRED",
      "An expected version is required for this intake operation",
    );
  return request.expectedVersion!;
}
function response(
  request:
    | {
        readonly id: string;
        readonly requestNo: string;
        readonly rowVersion: number;
        readonly createdAt: string;
        readonly updatedAt?: string;
      }
    | undefined,
  policyPreview: EntityIntakePolicyPreviewV1 | undefined,
  requestId: string | undefined,
): EntityIntakeOperationResponseV1 {
  return {
    schemaVersion: 1,
    ...(request
      ? {
          receipt: {
            code: request.requestNo,
            recordId: request.id,
            version: request.rowVersion,
            savedAt: request.updatedAt ?? request.createdAt,
            statusLabel: "Saved",
          },
        }
      : {}),
    ...(policyPreview ? { policyPreview } : {}),
    capabilities: [
      {
        operation: "exit",
        operationKey: "exit",
        label: "Exit",
        href: "/mdg/business-partner/manage",
      },
      { operation: "continue", operationKey: "continue", label: "Continue" },
      ...(requestId
        ? [
            {
              operation: "save_draft" as const,
              operationKey: "save_draft",
              label: "Save draft",
            },
            {
              operation: "submit" as const,
              operationKey: "submit",
              label: "Submit",
            },
          ]
        : [
            {
              operation: "save_draft" as const,
              operationKey: "save_draft",
              label: "Save draft",
            },
          ]),
    ],
  };
}
