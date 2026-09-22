import { describe, expect, it, vi } from "vitest";
import { createEmployeeClient, createWorkforceClient } from "./client";

describe("People/Workforce request client", () => {
  it("creates onboarding through the workforce authority with protected evidence", async () => {
    const request = vi.fn().mockResolvedValue({ request: {}, replayed: false });
    const client = createWorkforceClient({ request } as never);
    await client.onboard(
      {
        legalEntityId: "legal-1",
        companyCodeId: "company-1",
        orgUnitId: "org-unit-1",
        protectedProfileContentItemId: "content-1",
        requestedChanges: { employmentType: "regular" },
      },
      "workforce-test-key",
    );
    const call = request.mock.calls[0];
    expect(call?.[1]).toMatchObject({
      body: {
        idempotencyKey: "workforce-test-key",
        kind: "onboard_person",
        sourceKind: "manual",
        protectedProfileContentItemId: "content-1",
      },
    });
    expect(JSON.stringify(call)).not.toMatch(/businessPartner|dateOfBirth|nationalId|passport/i);
  });

  it("lists workforce requests without a Business Partner coordinate", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const client = createWorkforceClient({ request } as never);
    await client.list("company-1", "pending_approval");
    expect(request.mock.calls[0]?.[1]).toMatchObject({
      query: { companyCodeId: "company-1", status: "pending_approval", limit: 100 },
    });
  });
});

describe("Employee 360 client", () => {
  it("pins directory reads to the selected company and lifecycle", async () => {
    const request = vi.fn().mockResolvedValue([]);
    const client = createEmployeeClient({ request } as never);

    await client.list({companyCodeId:"company-1",status:"future",search:"Asha",sort:"number",cursor:"next"});

    expect(request.mock.calls[0]?.[1]).toMatchObject({
      query: { companyCodeId: "company-1", status: "future", search:"Asha",sort:"number",cursor:"next",limit:20 },
    });
  });

  it("encodes an employee identifier in the detail route", async () => {
    const request = vi.fn().mockResolvedValue({});
    const client = createEmployeeClient({ request } as never);

    await client.get("employee/one");

    expect(request.mock.calls[0]?.[1]).toMatchObject({
      params: { employeeId: "employee/one" },
    });
  });

  it("uses independent section, saved-view and protected-reveal contracts", async () => {
    const request = vi.fn().mockResolvedValue({items:[]});
    const client = createEmployeeClient({ request } as never);
    await client.section("employee/one","audit",{cursor:"page-2"});
    await client.savedViews();
    await client.saveView("Active employees",{status:"employed"});
    await client.reveal("person/one","compliance",["passportNumberToken"]);
    expect(request.mock.calls.map(call=>call[1])).toEqual(expect.arrayContaining([
      expect.objectContaining({params:{employeeId:"employee/one",section:"audit"},query:expect.objectContaining({cursor:"page-2"})}),
      expect.objectContaining({query:{surface:"employee_directory"}}),
      expect.objectContaining({body:{name:"Active employees",surfaceCode:"employee_directory",state:{status:"employed"}}}),
      expect.objectContaining({params:{personId:"person/one"},body:{purpose:"compliance",fields:["passportNumberToken"]}}),
    ]));
  });
});
