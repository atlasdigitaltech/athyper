import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapBusinessPartner360Activity } from "../business-partner-360-activity-mapper.js";

function activity(eventCode: string) {
  return mapBusinessPartner360Activity({
    id: "activity-1",
    eventCode,
    occurredAt: "2026-09-09T04:04:53.000Z",
    source: "audit",
    sourceService: "master-data",
    entityType: "entity_case",
    changedFields: ["status", "proposed_payload", "national_id"],
  });
}

describe("Business Partner 360 request activity", () => {
  it.each([
    ["business_partner.case.materialized", "Request applied"],
    ["business_partner.workflow.stage.activated", "Approval stage activated"],
    ["business_partner.workflow.vote.recorded", "Approval vote recorded"],
  ])("maps %s while preserving field redaction", (eventCode, title) => {
    expect(activity(eventCode)).toMatchObject({
      eventCode,
      title,
      changedFields: ["status"],
    });
  });

  it("supports all activity events emitted by the request service", () => {
    const source = readFileSync(
      new URL("../business-partner-request-service.ts", import.meta.url),
      "utf8",
    );
    const codes = [...source.matchAll(/"(business_partner\.[a-z_.]+)"/g)]
      .map((match) => match[1]!);
    expect(codes).toContain("business_partner.case.materialized");
    for (const code of new Set(codes)) {
      expect(() => activity(code), code).not.toThrow();
    }
  });
});
