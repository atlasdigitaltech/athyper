import { describe, expect, it } from "vitest";
import {
  buildRelationshipExtensions,
  newAddress,
  newContact,
} from "./request-relationships.js";

describe("request relationship components", () => {
  it("serializes repeatable address and contact rows with stable typed coordinates", async () => {
    const address = {
        ...newAddress(),
        line1: " 1 Main Street ",
        city: "London",
        countryCode: "gb",
      },
      contact = {
        ...newContact(),
        contactName: " Ada Buyer ",
        channels: [{ ...newContact().channels[0]!, value: "ada@example.test" }],
      };
    const result = await buildRelationshipExtensions([address], [contact]);
    expect(result.addresses[0]).toMatchObject({
      line1: "1 Main Street",
      city: "London",
      countryCode: "GB",
      isPrimary: true,
      normalizedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(result.contactPersons[0]).toMatchObject({
      contactName: "Ada Buyer",
      isPrimary: true,
    });
    expect(result.contactChannels[0]).toMatchObject({
      contactClientItemKey: contact.key,
      channelType: "email",
      value: "ada@example.test",
      isPrimary: true,
    });
  });
});

import {
  buildProfileExtensions,
  hiddenProfileValues,
} from "./request-relationships.js";
import type { EntityIntakeSurfaceV1 } from "@athyper/contract-platform-entity-runtime";
const profileSurface: EntityIntakeSurfaceV1 = {
  schemaVersion: 1,
  key: "details",
  title: "Details",
  columns: 1,
  sections: [
    {
      key: "main",
      columns: 12,
      fields: [
        {
          control: "input",
          key: "view",
          valueKey: "view",
          label: "View",
          required: false,
          widget: "text",
          columnSpan: 12,
        },
        ...(["taxRegistrations", "certifications", "aliases"] as const).map(
          (key) => ({
            control: "repeatableGroup" as const,
            key,
            valueKey: key,
            extensionGroup: key,
            label: key,
            itemLabel: key,
            addLabel: "Add",
            removeLabel: "Remove",
            itemSurfaceKey: key,
            minItems: 0,
            maxItems: 20,
            columnSpan: 12,
            visibleWhen: {
              field: "view",
              operator: "equals" as const,
              value: "full",
            },
          }),
        ),
      ],
    },
  ],
};
it("protects tax and certificate numbers before assembling the request", async () => {
  const protectedCalls: string[] = [];
  const result = await buildProfileExtensions(
    profileSurface,
    {
      taxRegistrations: [{ key: "tax-1", value: "TAX-12345678" }],
      certifications: [
        {
          key: "cert-1",
          certificateNumber: "CERT-98765432",
          customName: "Certificate",
        },
      ],
    },
    async (kind, value) => {
      protectedCalls.push(kind + ":" + value);
      return {
        protectedValueToken: kind + ":opaque",
        maskedValue: "••••" + value.slice(-4),
        valueHash: "a".repeat(64),
      };
    },
  );
  expect(protectedCalls).toHaveLength(2);
  expect(JSON.stringify(result)).not.toContain("TAX-12345678");
  expect(JSON.stringify(result)).not.toContain("CERT-98765432");
  expect(result.taxRegistrations?.[0]).toMatchObject({
    protectedValueToken: "tax:opaque",
    maskedValue: "••••5678",
  });
  expect(result.certifications?.[0]).toMatchObject({
    certificateNumberToken: "certificate:opaque",
    maskedCertificateNumber: "••••5432",
  });
  await expect(
    buildProfileExtensions(profileSurface, {
      taxRegistrations: [{ key: "tax", value: "SECRET" }],
    }),
  ).rejects.toThrow("Protected registration capture");
});
it("blocks metadata visibility changes that would silently omit entered rows", () => {
  expect(
    hiddenProfileValues(
      profileSurface,
      { view: "full", aliases: [{ key: "a", aliasName: "Trading" }] },
      { view: "standard" },
    ),
  ).toBe(true);
  expect(
    hiddenProfileValues(
      profileSurface,
      { view: "full", aliases: [] },
      { view: "standard" },
    ),
  ).toBe(false);
});

it("protects bank values and keeps document association stable across row ordering", async () => {
 const surface={...profileSurface,sections:[{key:"bank",fields:[{control:"repeatableGroup" as const,key:"bank",valueKey:"bankAccounts",extensionGroup:"bankAccounts",label:"Bank",itemLabel:"Account",addLabel:"Add",removeLabel:"Remove",itemSurfaceKey:"bank",minItems:0,maxItems:20,columnSpan:12}]}]};
 const rows=[{key:"account-b",accountIdentifier:"00012345678",supportingDocuments:[{key:"document-b",attachmentId:"attachment-b",documentType:"bank_confirmation"}]},{key:"account-a",accountIdentifier:"00098765432",supportingDocuments:[]}];
 const protect=async(kind:string,raw:string)=>({protectedValueToken:`${kind}:opaque-${raw.slice(-4)}`,maskedValue:`••••${raw.slice(-4)}`,valueHash:"a".repeat(64)});
 const captured=await buildProfileExtensions(surface,{bankAccounts:rows},protect);
 expect(JSON.stringify(captured)).not.toContain("00012345678");
 expect(captured.supportingDocuments?.[0]).toMatchObject({entryKey:"account-b",sectionCode:"bankAccounts",clientItemKey:"document-b"});
 const reordered=await buildProfileExtensions(surface,{bankAccounts:[...rows].reverse()},protect);
 expect(reordered.supportingDocuments).toEqual(captured.supportingDocuments);
});

it("reuses a saved bank token while its masked identifier and context are unchanged",async()=>{
 const surface={...profileSurface,sections:[{key:"bank",fields:[{control:"repeatableGroup" as const,key:"bank",valueKey:"bankAccounts",extensionGroup:"bankAccounts",label:"Bank",itemLabel:"Account",addLabel:"Add",removeLabel:"Remove",itemSurfaceKey:"bank",minItems:0,maxItems:20,columnSpan:12}]}]};
 const prior={clientItemKey:"bank-1",bankCountryCode:"MY",accountIdType:"local_account",protectedValueToken:"bank:opaque",maskedValue:"••••1234",valueHash:"a".repeat(64)};
 let calls=0;const protect=async()=>{calls++;throw Error("Must not re-protect a mask")};
 const row={key:"bank-1",bankCountryCode:"MY",accountIdType:"local_account",accountIdentifier:"••••1234"};
 const result=await buildProfileExtensions(surface,{bankAccounts:[row]},protect,[],{bankAccounts:[prior]});
 expect(result.bankAccounts?.[0]?.protectedValueToken).toBe("bank:opaque");expect(calls).toBe(0);
 await expect(buildProfileExtensions(surface,{bankAccounts:[{...row,bankCountryCode:"QA"}]},protect,[],{bankAccounts:[prior]})).rejects.toThrow(/Re-enter/);
});
it("prevents a nested choice change from silently dropping a populated routing field",()=>{
 const bankSurface={schemaVersion:1 as const,key:"bank",title:"Bank",columns:1 as const,sections:[{key:"fields",fields:[{control:"input" as const,key:"kind",valueKey:"kind",label:"Type",required:true,widget:"text" as const,columnSpan:12,helpText:"Clear the routing code first."},{control:"input" as const,key:"routing",valueKey:"routing",label:"Routing",required:false,widget:"text" as const,columnSpan:12,visibleWhen:{field:"kind",operator:"equals" as const,value:"local"}}]}]};
 const surface={...profileSurface,sections:[{key:"banks",fields:[{control:"repeatableGroup" as const,key:"banks",valueKey:"banks",label:"Banks",itemLabel:"Bank",addLabel:"Add",removeLabel:"Remove",itemSurfaceKey:"bank",minItems:0,maxItems:20,columnSpan:12}]}]};
 expect(hiddenProfileValues(surface,{banks:[{key:"b",kind:"local",routing:"001"}]},{banks:[{key:"b",kind:"iban",routing:"001"}]},[bankSurface])).toBe(true);
});
