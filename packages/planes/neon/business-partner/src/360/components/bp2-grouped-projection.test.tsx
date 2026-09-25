import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { expect, it } from "vitest";
import { CompiledEntitySectionContent } from "@athyper/platform-entity-form-detail";

it("keeps declared facts primary and reference mappings collapsed with separate verification labels", () => {
  const resource = {
    presentation: {rendererKey:"platform.related-collection.v1",fields:[],childCollections:[
      {key:"industries",rendererKey:"platform.related-collection.v1",label:{labelKey:"industries",defaultText:"Declared industries"},fields:[{key:"industry_name"},{key:"verification_status"}]},
      {key:"industry_crosswalk_reference_evidence",rendererKey:"platform.related-collection.v1",display:"disclosure",label:{labelKey:"mappings",defaultText:"Related classification mappings"},description:"Mapped codes are not partner declarations.",fields:[{key:"verified",label:{labelKey:"mapping.verified",defaultText:"Mapping verified"}}]},
    ]},data:{collections:{industries:[{industry_name:"Research services",verification_status:"Not verified"}],industry_crosswalk_reference_evidence:[{verified:true,secret:"unpublished"}]}},
  } as unknown as ComponentProps<typeof CompiledEntitySectionContent>["resource"];
  const html=renderToStaticMarkup(<CompiledEntitySectionContent resource={resource}/>);
  expect(html).toContain("<details><summary>Related classification mappings</summary>");
  expect(html).not.toContain("<details open");
  expect(html.indexOf("Research services")).toBeLessThan(html.indexOf("<details>"));
  expect(html).toContain("Not verified");expect(html).toContain("Mapping verified");
  expect(html).not.toContain("unpublished");
});

it("renders published crosswalk children on a fields surface without exposing unbound evidence", () => {
  const resource = {
    presentation: { rendererKey: "platform.fields.v1", fields: [{ key: "name" }], childCollections: [{
      key: "industry_crosswalk_reference_evidence", rendererKey: "platform.related-collection.v1",
      fields: ["sourceDomainCode", "sourceCode", "targetDomainCode", "targetCode", "mappingType", "confidence", "provenance", "verified"].map(key => ({ key })),
    }] },
    data: { data: { collections: { industry_crosswalk_reference_evidence: [{ id: "evidence", sourceDomainCode: "naics", sourceCode: "11", targetDomainCode: "isic", targetCode: "01", mappingType: "NARROW", confidence: 86.48, provenance: "AI_GENERATED", verified: false, metadata: "not-published" }] } } },
  } as unknown as ComponentProps<typeof CompiledEntitySectionContent>["resource"];
  const html = renderToStaticMarkup(<CompiledEntitySectionContent resource={resource} />);
  for (const value of ["Industry Crosswalk Reference Evidence", "naics", "isic", "NARROW", "86.48", "AI_GENERATED"]) expect(html).toContain(value);
  expect(html).not.toContain("not-published");
  expect(html).not.toContain("<input");
});

it("renders only published local Network collections and fields, separately from Mesh data", () => {
  const resource = {
    presentation: {
      rendererKey: "platform.related-collection.v1",
      fields: [],
      childCollections: [
        {
          key: "commercial_relationships",
          fields: [
            { key: "relationship_type_code" },
            { key: "source_business_partner_id" },
            { key: "target_business_partner_id" },
          ],
        },
        { key: "governance_relations", fields: [{ key: "member_name" }] },
      ],
    },
    data: {
      data: {
        collections: {
          commercial_relationships: [
            null,
            {
              id: "rel",
              relationship_type_code: "affiliate",
              source_business_partner_id: "source-bp",
              target_business_partner_id: "target-bp",
              secret: "not-a-published-field",
            },
          ],
          governance_relations: [
            { id: "gov", member_name: "Synthetic director" },
          ],
          unpublished: [{ name: "not-a-published-collection" }],
        },
        local: { secret: "mesh-internal" },
      },
    },
  } as unknown as ComponentProps<
    typeof CompiledEntitySectionContent
  >["resource"];
  const html = renderToStaticMarkup(
    <CompiledEntitySectionContent resource={resource} />,
  );
  for (const value of [
    "affiliate",
    "source-bp",
    "target-bp",
    "Synthetic director",
    "Commercial Relationships",
    "Governance Relations",
  ])
    expect(html).toContain(value);
  for (const value of [
    "not-a-published-field",
    "not-a-published-collection",
    "mesh-internal",
  ])
    expect(html).not.toContain(value);
  expect(html).not.toContain("<input");
});
