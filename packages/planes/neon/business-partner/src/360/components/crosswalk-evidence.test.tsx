import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { CrosswalkEvidence } from "./crosswalk-evidence";

it("labels analytical crosswalks as read-only unverified evidence, not classification changes", () => {
  const html = renderToStaticMarkup(
    <CrosswalkEvidence
      items={[
        {
          id: "x",
          sourceDomainCode: "naics",
          sourceCode: "11",
          targetDomainCode: "isic",
          targetCode: "A",
          targetName: "Agriculture",
          mappingType: "EXACT",
          confidence: 98,
          provenance: "AI_GENERATED",
          verified: false,
          readOnly: true,
          metadata: { secret: "never-display" },
        },
      ]}
    />,
  );
  expect(html).toContain("selected classification is unchanged");
  for (const text of [
    "naics",
    "isic",
    "AI_GENERATED",
    "Unverified",
    "confidence 98",
  ])
    expect(html).toContain(text);
  expect(html).not.toContain("never-display");
  expect(html).not.toContain("<button");
});
it("does not render malformed or mutable evidence", () => {
  expect(
    renderToStaticMarkup(
      <CrosswalkEvidence items={[null, {}, { id: "x", readOnly: false }]} />,
    ),
  ).toBe("");
});
