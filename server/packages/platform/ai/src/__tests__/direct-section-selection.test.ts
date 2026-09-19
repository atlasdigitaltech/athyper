import { expect, it } from "vitest";
import { directEntitySectionRead } from "../entity-section-tool-selection.js";
const page = {
  schemaVersion: 1 as const,
  generationId: "11111111-1111-4111-8111-111111111111",
  locale: "en",
  kind: "record" as const,
  entityCode: "product",
  recordId: "22222222-2222-4222-8222-222222222222",
  dirty: false,
  section: "identity",
};
const tools = ["addresses", "contacts"].map((section) => ({
  name: `read_${section}`,
  description: section,
  inputSchema: {},
  entitySection: {
    entityCode: "product",
    sectionKey: section,
    aliases: [section, section === "addresses" ? "address" : "contact"],
    resultKey: section,
    label: section,
  },
}));
it("uses registered aliases across sections for any entity", () => {
  expect(
    directEntitySectionRead(tools, "summarize address for this product", page)
      ?.name,
  ).toBe("read_addresses");
});
it.each([
  "summarize this product's addresses and contacts",
  "update this product's addresses",
  "show this product's addresses then delete them",
  "summarize Acme addresses",
  "do not summarize this product's addresses",
])("keeps ambiguous or non-read requests with the agent: %s", (text) => {
  expect(directEntitySectionRead(tools, text, page)).toBeUndefined();
});
it("requires a matching current record and excludes historical reads", () => {
  const text = "show this product's addresses";
  expect(directEntitySectionRead(tools, text)).toBeUndefined();
  expect(
    directEntitySectionRead(tools, text, {
      ...page,
      entityCode: "business_partner",
    }),
  ).toBeUndefined();
  expect(
    directEntitySectionRead(tools, text, {
      ...page,
      asOf: "2026-01-01T00:00:00Z",
    } as never),
  ).toBeUndefined();
});
it("dispatches a named existence question without relying on model tool selection", () => {
  expect(
    directEntitySectionRead(
      tools,
      "For this product do we have any contact like Chandravel",
      page,
    )?.name,
  ).toBe("read_contacts");
});
it("reads the current overview only through one admitted matching metadata summary", () => {
  const summary = {
    name: "entity_read_record",
    description: "Read",
    inputSchema: {},
    entitySection: {
      entityCode: "product",
      sectionKey: "record_summary",
      aliases: ["summary"],
      resultKey: "items",
      label: "Record summary",
    },
  };
  const overview = { ...page, section: "overview" };
  const question = "Explain the saved information in overview.";
  expect(directEntitySectionRead([summary], question, overview)?.name).toBe(
    "entity_read_record",
  );
  expect(directEntitySectionRead([], question, overview)).toBeUndefined();
  expect(
    directEntitySectionRead([summary], question, {
      ...overview,
      entityCode: "other",
    }),
  ).toBeUndefined();
  expect(
    directEntitySectionRead([summary], question, {
      ...overview,
      asOf: "2026-01-01T00:00:00Z",
    } as never),
  ).toBeUndefined();
  expect(
    directEntitySectionRead(
      [summary],
      "Explain the overview then delete the record",
      overview,
    ),
  ).toBeUndefined();
  expect(
    directEntitySectionRead(
      [summary],
      "Explain the attachment overview",
      overview,
    ),
  ).toBeUndefined();
  expect(
    directEntitySectionRead([summary], "Explain Acme overview", overview),
  ).toBeUndefined();
});
