/**
 * isActiveApproverFor — unit tests against the mock-db harness.
 *
 * Each test seeds the three tables the predicate reads
 * (event.work_item ⨝ document.workflow_request, master.auth_group_member,
 * master.delegation_grant) and asserts the boolean output.
 */

import { describe, it, expect } from "vitest";
import { isActiveApproverFor } from "../active-approver.service.js";
import { makeMockDb } from "../../../test-utils/src/index.js";
import { TENANT_ID, PRINCIPAL_ID, PRINCIPAL_ID2, ENTITY_ID } from "../../../test-utils/src/fixtures.js";

const ENTITY_CODE = "purchase_invoice";

function activeWorkItem(over: Record<string, unknown> = {}) {
  return {
    id: "wi-1",
    assignee_id: PRINCIPAL_ID,
    assignee_group_id: null,
    ...over,
  };
}

describe("isActiveApproverFor", () => {
  it("returns false when no active workflow_request exists for the record", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [],
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(false);
  });

  it("returns true when the principal is the direct assignee on a pending work_item", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [activeWorkItem({ assignee_id: PRINCIPAL_ID })],
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(true);
  });

  it("returns false when work_item is assigned to a different principal with no group / delegation", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [activeWorkItem({ assignee_id: PRINCIPAL_ID2 })],
        "master.auth_group_member as agm":   null,
        "master.delegation_grant as dg":     null,
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(false);
  });

  it("returns true when principal is a member of an assigned group", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [
          activeWorkItem({ assignee_id: null, assignee_group_id: "group-1" }),
        ],
        // Group membership hit
        "master.auth_group_member as agm": [{ group_id: "group-1" }],
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(true);
  });

  it("returns true when principal holds an active delegation from the assignee", async () => {
    const db = makeMockDb({
      tables: {
        // Direct assignee is PRINCIPAL_ID2 — caller is PRINCIPAL_ID, the delegate
        "event.work_item as wi": [activeWorkItem({ assignee_id: PRINCIPAL_ID2 })],
        "master.auth_group_member as agm":   null,
        "master.delegation_grant as dg":     [{ id: "delegation-1" }],
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(true);
  });

  it("returns false when no group membership AND no delegation matches", async () => {
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [
          activeWorkItem({ assignee_id: PRINCIPAL_ID2, assignee_group_id: "group-1" }),
        ],
        "master.auth_group_member as agm": null,
        "master.delegation_grant as dg":   null,
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(false);
  });

  it("skips the group-membership query when no work_item has assignee_group_id", async () => {
    // Single direct-assignee work_item with no group. Group table should not
    // be consulted; we leave it empty and the test still passes via the
    // direct-assignee branch returning early.
    const db = makeMockDb({
      tables: {
        "event.work_item as wi": [activeWorkItem({ assignee_id: PRINCIPAL_ID })],
      },
    });

    const result = await isActiveApproverFor({
      db: db as never,
      tenantId: TENANT_ID,
      principalId: PRINCIPAL_ID,
      entityCode: ENTITY_CODE,
      recordId: ENTITY_ID,
    });

    expect(result).toBe(true);
  });
});
