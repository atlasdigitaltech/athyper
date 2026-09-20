import { describe, expect, it, vi } from "vitest";
import { createEntityOperationDispatcher } from "./entity-operation-dispatcher.js";

const operation = {
  artifactType: "operation", entityCode: "business_partner", content: {
    concurrency: { expectedRecordVersionRequired: true },
    operations: [{ key: "request_change", permissionCode: "bp.amend", idempotency: "required", execution: { handlerKey: "neon.bp.governed-request.create.v1" } }],
  },
};
const context = { tenantId: "tenant", principalId: "principal", planeKey: "neon", permissions: { allowed: ["bp.amend"] } } as any;
describe("entity operation dispatcher", () => {
  it("admits only a declared pinned operation before invoking its registered domain handler", async () => {
    const handler = { execute: vi.fn(async () => ({ requestId: "request" })) };
    const dispatcher = createEntityOperationDispatcher({
      reader: { resolve: vi.fn(async () => ({ release: {} })), operation: vi.fn(async () => operation) } as any,
      handlers: { get: vi.fn(() => handler) },
    });
    await expect(dispatcher.execute({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", operationKey: "request_change", expectedVersion: 3, idempotencyKey: "request-change-0001", input: {} })).resolves.toMatchObject({ requestId: "request", changedResources: [{ entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001" }] });
    expect(handler.execute).toHaveBeenCalledOnce();
    await expect(dispatcher.execute({ context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", operationKey: "request_change", idempotencyKey: "request-change-0001", input: {} })).rejects.toMatchObject({ code: "ENTITY_RUNTIME_OPERATION_VERSION_REQUIRED" });
    expect(handler.execute).toHaveBeenCalledOnce();
  });
  it("rejects undeclared input and a client target that conflicts with the route target", async () => {
    const handler = { execute: vi.fn(async () => ({})) };
    const dispatcher = createEntityOperationDispatcher({ reader: { resolve: vi.fn(async () => ({ release: {} })), operation: vi.fn(async () => ({ ...operation, content: { ...operation.content, operations: [{ ...operation.content.operations[0], inputSchema: { required: ["reason"], properties: { reason: { type: "string" }, targetBusinessPartnerId: { type: "string" } }, additionalProperties: false }, targetBinding: { clientSuppliedTargetEntityCode: "forbidden", targetIdField: "targetBusinessPartnerId" } }] } })) } as any, handlers: { get: vi.fn(() => handler) } });
    const base = { context, entityCode: "business_partner", recordId: "00000000-0000-4000-8000-000000000001", operationKey: "request_change", expectedVersion: 3, idempotencyKey: "request-change-0001" };
    await expect(dispatcher.execute({ ...base, input: {} })).rejects.toMatchObject({ code: "ENTITY_RUNTIME_OPERATION_INPUT_REQUIRED" });
    await expect(dispatcher.execute({ ...base, input: { reason: "x", targetBusinessPartnerId: "different" } })).rejects.toMatchObject({ code: "ENTITY_RUNTIME_OPERATION_TARGET_MISMATCH" });
    expect(handler.execute).not.toHaveBeenCalled();
  });
});

describe("cross-entity operation artifacts", () => {
  it("keeps the admitted release pin while resolving a related request operation", async () => {
    const handler = { execute: vi.fn(async () => ({ requestId: "request" })) };
    const requestOperation = { artifactType: "operation", entityCode: "business_partner_request", content: {
      concurrency: { expectedRecordVersionRequired: true },
      operations: [{ key: "submit", permissionCode: "case.submit", idempotency: "required", inputSchema: { properties: {}, additionalProperties: false }, execution: { handlerKey: "request.submit" } }],
    } };
    const reader = { resolve: vi.fn(async () => ({ coordinate: { entityCode: "business_partner" } })), operation: vi.fn(), artifactByKey: vi.fn(async () => requestOperation) };
    const dispatcher = createEntityOperationDispatcher({
      reader: reader as any,
      artifacts: { resolve: ({ entityCode, operationKey }) => entityCode === "business_partner_request" && operationKey === "submit" ? { releaseEntityCode: "business_partner", operationEntityCode: "business_partner_request" } : undefined },
      handlers: { get: vi.fn(() => handler) },
    });
    const requestContext = { ...context, permissions: { allowed: ["case.submit"] } };
    await expect(dispatcher.execute({ context: requestContext, entityCode: "business_partner_request", recordId: "00000000-0000-4000-8000-000000000002", operationKey: "submit", expectedVersion: 2, idempotencyKey: "submit-0001", input: {} })).resolves.toMatchObject({ requestId: "request" });
    expect(reader.resolve).toHaveBeenCalledWith(expect.objectContaining({ entityCode: "business_partner" }));
    expect(reader.artifactByKey).toHaveBeenCalledWith(expect.anything(), "business_partner_request/operation", "operation");
  });
});
