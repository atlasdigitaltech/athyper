import {
  parseEntityIntakeOperationResponse,
  type EntityIntakeOperationKind,
  type EntityIntakeOperationRequestV1,
} from "@athyper/contract-platform-entity-runtime";
import { createOperation, encodePathSegment, type HttpClient } from "@athyper/platform-api-client";

const intakeOperation = createOperation({
  method: "POST",
  path: ({ entityCode, flowKey, operation }) =>
    `/entity-runtime/${encodePathSegment(entityCode)}/intake/${encodePathSegment(flowKey)}/operations/${encodePathSegment(operation)}`,
  idempotency: "required",
  parse: parseEntityIntakeOperationResponse,
});

/** Calls a registered domain provider; the browser never chooses provider keys or policy outcomes. */
export const entityIntakeOperationClient = Object.freeze({
  execute: (client: HttpClient, input: {
    readonly entityCode: string;
    readonly request: EntityIntakeOperationRequestV1;
    readonly idempotencyKey: string;
    readonly signal?: AbortSignal;
  }) => client.request(intakeOperation, {
    params: { entityCode: input.entityCode, flowKey: input.request.flowKey, operation: input.request.operation },
    body: input.request,
    idempotencyKey: input.idempotencyKey,
    headers: input.request.expectedVersion === undefined ? undefined : { "If-Match": String(input.request.expectedVersion) },
    signal: input.signal,
  }),
});
