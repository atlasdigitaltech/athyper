import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BusinessPartnerWorkflowDesigner } from "./workflow-designer";

describe("Business Partner workflow designer", () => {
  it("authors conditional parallel quorum stages with communication-aware SLA controls", () => {
    const html = renderToStaticMarkup(
      <BusinessPartnerWorkflowDesigner
        value={{ supplier: { version: "3.0.0", stages: [{ code: "compliance_tax", name: "Compliance and tax", mode: "parallel", quorum: { kind: "all" }, slaMinutes: 480, remindersAtMinutes: [240, 384], escalateAtMinutes: 480, when: { path: "ownershipClass", operator: "not_equals", value: "internal" } }] } }}
        onChange={() => undefined}
      />,
    );
    expect(html).toContain("Workflow administration");
    expect(html).toContain("Parallel");
    expect(html).toContain("Reminder minutes");
    expect(html).toContain("Conditional route");
    expect(html).toContain("communication channels");
  });
});
