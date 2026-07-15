import { describe, expect, it } from "vitest";
import { resolveAuditSummaryData } from "../header/audit-summary-strip";

describe("resolveAuditSummaryData", () => {
  it("maps canonical audit fields and actor display companions", () => {
    const audit = resolveAuditSummaryData({
      recordId: "route-1",
      record: {
        data: {
          id: "019eb6a8-1234-4567-8901-964772000000",
          status: "active",
          is_active: true,
          created_at: "2026-06-11T12:28:00.000Z",
          created_by: "00000000-0000-0000-0000-000000000000",
          updatedAt: "2026-06-13T05:31:00.000Z",
          updatedByName: "ATHQ Admin",
          updatedById: "aa001000-0000-0000-0000-000000000007",
          statusChangedAt: null,
        },
      },
    });

    expect(audit.identifier).toBe("019eb6a8-1234-4567-8901-964772000000");
    expect(audit.status).toBe("active");
    expect(audit.isActive).toBe(true);
    expect(audit.createdBy).toBe("System");
    expect(audit.createdById).toBe("00000000-0000-0000-0000-000000000000");
    expect(audit.updatedBy).toBe("ATHQ Admin");
    expect(audit.updatedById).toBe("aa001000-0000-0000-0000-000000000007");
  });
});
