import { describe, expect, it, vi } from "vitest";
import { createEntityOperationDispatcher } from "./entity-operation-dispatcher.js";

describe("BP2 visibility does not grant write authority", () => {
  const input = {
    context: {
      planeKey: "neon",
      tenantId: "tenant",
      principalId: "reader",
      permissions: { allowed: ["bp.read"] },
    } as any,
    entityCode: "business_partner",
    recordId: "00000000-0000-4000-8000-000000000001",
    operationKey: "change",
    input: {},
  };
  it("denies a visible record's declared write without its explicit permission", async () => {
    const execute = vi.fn();
    const get = vi.fn(() => ({ execute }));
    const dispatcher = createEntityOperationDispatcher({
      reader: {
        resolve: async () => ({}),
        operation: async () => ({
          artifactType: "operation",
          content: {
            operations: [
              {
                key: "change",
                permissionCode: "bp.write",
                execution: { handlerKey: "bp.change" },
              },
            ],
          },
        }),
      } as any,
      handlers: { get },
    });
    await expect(dispatcher.execute(input)).rejects.toMatchObject({
      code: "ENTITY_RUNTIME_OPERATION_FORBIDDEN",
    });
    expect(get).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("keeps a declared but unimplemented operation unavailable", async () => {
    const dispatcher = createEntityOperationDispatcher({
      reader: {
        resolve: async () => ({}),
        operation: async () => ({
          artifactType: "operation",
          content: {
            operations: [
              {
                key: "change",
                permissionCode: "bp.read",
                execution: { handlerKey: "missing" },
              },
            ],
          },
        }),
      } as any,
      handlers: { get: () => undefined },
    });
    await expect(dispatcher.execute(input)).rejects.toMatchObject({
      code: "ENTITY_RUNTIME_OPERATION_HANDLER_UNAVAILABLE",
    });
  });
});
