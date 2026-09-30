import assert from "node:assert/strict";
import test from "node:test";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
import { withBusinessPartnerLabels } from "../../provisioning/business-partner-labels";

test("label upgrade preserves author customizations, source graph, and repeated runs", () => {
  const source = {
    entity: { entityCode: "business_partner" },
    surfaces: [{ id: "intake", surfaceKey: "intake_partner" }],
    surfaceSections: [
      { entitySurfaceId: "intake", sectionKey: "role", title: "Choose a role" },
    ],
    surfaceFieldBindings: [
      {
        entitySurfaceId: "intake",
        bindingKey: "requested_role",
        labelOverride: "Requested role",
        displayConfig: { required: true },
      },
      {
        entitySurfaceId: "intake",
        bindingKey: "partner",
        displayConfig: {
          lookup: {
            adapterKey: "business_partner.intake",
            actions: [
              {
                key: "create_supplier",
                label: "Onboard new supplier",
                visibleWhen: { field: "requested_role", value: "supplier" },
              },
              { key: "create_customer", label: "Custom customer action" },
            ],
          },
        },
      },
      {
        entitySurfaceId: "other",
        bindingKey: "requested_role",
        labelOverride: "Requested role",
      },
    ],
  } as unknown as MetaEntityGraph;
  const before = structuredClone(source);
  const result = withBusinessPartnerLabels(source);
  assert.deepEqual(source, before);
  assert.equal(result.surfaceSections![0].title, undefined);
  assert.equal(result.surfaceFieldBindings![0].labelOverride, "Role");
  assert.equal(result.surfaceFieldBindings![0].displayConfig!.required, true);
  const actions = (result.surfaceFieldBindings![1].displayConfig!.lookup as any)
    .actions;
  assert.equal(actions[0].label, "New supplier request");
  assert.deepEqual(actions[0].visibleWhen, {
    field: "requested_role",
    value: "supplier",
  });
  assert.equal(actions[1].label, "Custom customer action");
  assert.equal(result.surfaceFieldBindings![2].labelOverride, "Requested role");
  assert.deepEqual(withBusinessPartnerLabels(result), result);
});
