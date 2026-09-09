import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemCard } from "./common-section";
import { RelatedRecord } from "@athyper/platform-entity-form-detail";
import { readFileSync } from "node:fs";
import {
  createBusinessPartner360SectionClient,
  type CommonSectionItem,
} from "../business-partner-360-section-client";

const client = {} as ReturnType<typeof createBusinessPartner360SectionClient>;
const render = (item: CommonSectionItem) =>
  renderToStaticMarkup(
    <ItemCard
      item={item}
      section="identity"
      client={client}
      businessPartnerId="bp-1"
    />,
  );

describe("Identity record cards", () => {
  it("renders partner fields only on the canonical identity", () => {
    const html = render({
      id: "bp-1",
      kind: "canonical",
      displayName: "Northwind Supplies",
      code: "CATL-BP-001",
      legalName: "Northwind Industrial Supplies Ltd",
    });
    expect(html).toContain("Northwind Supplies");
    expect(html).toContain("CATL-BP-001");
    expect(html).toContain("Legal name");
    expect(html).not.toContain("External ID");
    expect(html).not.toContain("Classification ID");
  });
  it("renders classification details without empty partner fields", () => {
    const html = render({
      id: "classification-1",
      kind: "classification",
      industryDomainCode: "isic",
      industryCodeId: "industry-1",
      industryCode: "4659",
      industryName: "Wholesale of other machinery and equipment",
      primary: false,
      verified: true,
    });
    expect(html).toContain("Industry classification");
    expect(html).toContain("industry-1");
    expect(html).toContain("ISIC");
    expect(html).toContain("4659");
    expect(html).toContain("Wholesale of other machinery and equipment");
    expect(html).toContain("<details>");
    expect(html).not.toContain("Legal name");
    expect(html).not.toContain("Aliases");
    expect(html).not.toContain("External ID");
  });
  it("renders external reference details without empty partner fields", () => {
    const profile = JSON.parse(readFileSync(new URL("../../../../../../../server/db/scripts/provisioning/config/business-partner-record-presentation.v1.json", import.meta.url), "utf8")).recordPresentation.related.find((entry: {source: string}) => entry.source === "external-reference.v1");
    const html = renderToStaticMarkup(<RelatedRecord profile={profile} hideScope values={{
      id: "reference-1",
      kind: "external_reference",
      sourceSystemCode: "athyper_mesh",
      externalEntityCode: "partner",
      externalId: "remote-1",
    }} />);
    expect(html).toContain("External reference");
    expect(html).toContain("Athyper Mesh");
    expect(html).toContain("remote-1");
    expect(html).not.toContain("Legal name");
    expect(html).not.toContain("Aliases");
    expect(html).not.toContain("Classification ID");
  });
});
