import { describe, expect, it, vi } from "vitest";
import { makeMockDb } from "../../../test-utils/src/index.js";
import {
  ENTITY_ID,
  PRINCIPAL_ID,
  TENANT_ID,
} from "../../../test-utils/src/fixtures.js";
import { syncLifecycleInstanceForStatus } from "../lifecycle-instance-sync.js";

const LIFECYCLE_ID = "00000000-0000-0000-0000-00000000lc01";
const STATE_ID = "00000000-0000-0000-0000-00000000st01";

describe("syncLifecycleInstanceForStatus", () => {
  it("upserts the matching lifecycle instance for current status", async () => {
    const db = makeMockDb({
      tables: {
        "control.entity_lifecycle as el": [{
          lifecycle_id: LIFECYCLE_ID,
          state_id: STATE_ID,
          state_code: "pending_approval",
          conditions: null,
        }],
      },
    });

    const result = await syncLifecycleInstanceForStatus({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      status: "pending-approval",
      actorId: PRINCIPAL_ID,
    });

    expect(result).toMatchObject({
      synced: true,
      lifecycleId: LIFECYCLE_ID,
      stateId: STATE_ID,
      stateCode: "pending_approval",
    });
  });

  it("skips conditional bindings that do not match the payload", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const db = makeMockDb({
      tables: {
        "control.entity_lifecycle as el": [{
          lifecycle_id: LIFECYCLE_ID,
          state_id: STATE_ID,
          state_code: "pending_approval",
          conditions: { "==": [{ var: "company_code_id" }, "other"] },
        }],
      },
    });

    const result = await syncLifecycleInstanceForStatus({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      status: "pending_approval",
      actorId: PRINCIPAL_ID,
      payload: { company_code_id: "expected" },
      logger,
    });

    expect(result).toEqual({ synced: false, reason: "binding_not_found" });
  });

  it("returns binding_not_found when no lifecycle binding exists", async () => {
    const db = makeMockDb();

    const result = await syncLifecycleInstanceForStatus({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      status: "pending_approval",
      actorId: PRINCIPAL_ID,
    });

    expect(result).toEqual({ synced: false, reason: "binding_not_found" });
  });

  it("returns condition_error when a matching binding condition cannot be evaluated", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const db = makeMockDb({
      tables: {
        "control.entity_lifecycle as el": [{
          lifecycle_id: LIFECYCLE_ID,
          state_id: STATE_ID,
          state_code: "pending_approval",
          conditions: { unsupported_operator: [] },
        }],
      },
    });

    const result = await syncLifecycleInstanceForStatus({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      status: "pending_approval",
      actorId: PRINCIPAL_ID,
      logger,
    });

    expect(result).toEqual({ synced: false, reason: "condition_error" });
    expect(logger.warn).toHaveBeenCalledWith("lifecycle_binding_condition_error", expect.objectContaining({
      lifecycleId: LIFECYCLE_ID,
      reason: "condition_error",
    }));
  });

  it("uses the system actor when actorId is null", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      selectFrom: () => {
        const builder = {
          innerJoin: () => builder,
          select: () => builder,
          where: () => builder,
          orderBy: () => builder,
          execute: vi.fn().mockResolvedValue([{
            lifecycle_id: LIFECYCLE_ID,
            state_id: STATE_ID,
            state_code: "pending_approval",
            conditions: null,
          }]),
        };
        return builder;
      },
      insertInto: () => {
        const conflictBuilder = { columns: () => ({ doUpdateSet: () => undefined }) };
        const builder = {
          values: (value: Record<string, unknown>) => {
            inserted.push(value);
            return builder;
          },
          onConflict: (callback: (oc: typeof conflictBuilder) => unknown) => {
            callback(conflictBuilder);
            return builder;
          },
          execute: vi.fn().mockResolvedValue(undefined),
        };
        return builder;
      },
    };

    await syncLifecycleInstanceForStatus({
      db: db as never,
      tenantId: TENANT_ID,
      entityName: "purchase_invoice",
      entityId: ENTITY_ID,
      status: "pending_approval",
      actorId: null,
    });

    expect(inserted[0]).toMatchObject({
      created_by: "00000000-0000-0000-0000-000000000000",
      updated_by: "00000000-0000-0000-0000-000000000000",
    });
  });
});
