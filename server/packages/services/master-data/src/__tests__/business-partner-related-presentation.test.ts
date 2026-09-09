import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseEntityRecordPresentation,
  RELATED_RECORD_MODELS,
} from "@athyper/contract-platform-entity-runtime";
import type {
  BusinessPartner360Summary,
  BusinessPartner360ContactItem,
  BusinessPartner360AddressItem,
  BusinessPartner360AddressEventItem,
} from "@athyper/server-contract-master-data";
import { businessPartnerRecordHeader } from "../business-partner-record-header.js";
const config = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../db/scripts/provisioning/config/business-partner-record-presentation.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const presentation = parseEntityRecordPresentation(config.recordPresentation);
// Compilation ensures the presentation field catalogue stays within real section DTOs.
const contactFields: Partial<
  Record<keyof BusinessPartner360ContactItem, string>
> = RELATED_RECORD_MODELS["contact-person.v1"].fields;
const addressFields: Partial<
  Record<keyof BusinessPartner360AddressItem, string>
> = RELATED_RECORD_MODELS["address-link.v1"].fields;
const channels: Partial<
  Record<keyof BusinessPartner360ContactItem["channels"][number], string>
> = RELATED_RECORD_MODELS["contact-person.v1"].channels;
const events: Partial<
  Record<keyof BusinessPartner360AddressEventItem, string>
> = RELATED_RECORD_MODELS["address-link.v1"].timeline;
const bindingParity: [
  Exclude<keyof typeof RELATED_RECORD_MODELS["contact-person.v1"]["fields"], keyof BusinessPartner360ContactItem>,
  Exclude<keyof typeof RELATED_RECORD_MODELS["address-link.v1"]["fields"], keyof BusinessPartner360AddressItem>,
  Exclude<keyof typeof RELATED_RECORD_MODELS["contact-person.v1"]["channels"], keyof BusinessPartner360ContactItem["channels"][number]>,
  Exclude<keyof typeof RELATED_RECORD_MODELS["address-link.v1"]["timeline"], keyof BusinessPartner360AddressEventItem>
] extends [never, never, never, never] ? true : false = true;
const summary = {
  identity: { id: "bp", displayName: "Partner", lifecycleStatus: "active" },
  roles: [],
  asOf: "2026-09-09",
  completeness: { readOnly: false },
  sections: [
    { code: "contacts", authorization: "granted", count: 1 },
    { code: "addresses", authorization: "restricted", count: 99 },
    {
      code: "banking",
      authorization: "granted",
      count: 12,
      reasonCode: "BP_360_SCOPE_REQUIRED",
    },
  ],
} as unknown as BusinessPartner360Summary;
describe("published related record profiles", () => {
  it("only sends profiles and actions authorized for the current record", () => {
    const header = businessPartnerRecordHeader(summary, {}, presentation);
    expect(header.related?.map((p) => p.sectionKey)).toEqual(["contacts"]);
    expect(header.related?.[0]?.actions).toEqual([]);
    expect(header.relatedActions).toEqual([]);
    expect(header.sections.find((s) => s.key === "banking")).toMatchObject({
      scopePrompt: "Select company",
    });
    expect(
      header.sections.find((s) => s.key === "banking")?.count,
    ).toBeUndefined();
  });
  it("historical records do not expose child change actions", () => {
    const historical = {
      ...summary,
      completeness: { ...summary.completeness, readOnly: true },
    };
    const header = businessPartnerRecordHeader(
      historical,
      {
        amend_partner: {
          code: "amend_partner",
          label: "Change",
          href: "/change",
          authority: "entity_case",
          permission: "create",
        },
      },
      presentation,
    );
    expect(header.relatedActions).toEqual([]);
    expect(header.related?.[0]?.actions).toEqual([]);
  });
  it("registers actual response fields for contacts, postal addresses and verification history", () => {
    expect(bindingParity).toBe(true);
    expect(contactFields.displayName).toBe("string");
    expect(addressFields.validatedAt).toBe("datetime");
    expect(channels.verified).toBe("boolean");
    expect(events.occurredAt).toBe("datetime");
  });
});
