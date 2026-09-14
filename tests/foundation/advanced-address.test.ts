import { test } from "node:test";
import assert from "node:assert/strict";
import { withBusinessPartnerAdvancedAddress } from "../../server/db/scripts/provisioning/business-partner-address-editor";
import { compileEntityIntakeSurfaces } from "../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
import {
  dataSurfaceDefaults,
  dataSurfaceValues,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
import {
  buildRelationshipExtensions,
  newAddress,
  restoreProfileAnswers,
} from "../../packages/planes/neon/business-partner/src/request-relationships";
const graph: any = {
  entity: { entityCode: "business_partner" },
  fields: [],
  surfaceSections: [],
  surfaceFieldBindings: [],
  surfaces: [
    {
      id: "address",
      surfaceKey: "partner_address_intake",
      surfaceKind: "form",
      title: "Address",
      layoutKind: "flow",
      layoutConfig: { renderer: "intake", columns: 1 },
      status: "active",
    },
  ],
};
test("advanced address metadata is idempotent and PO box validates on submit while preserving drafts", () => {
  const authored = withBusinessPartnerAdvancedAddress(graph);
  assert.deepEqual(withBusinessPartnerAdvancedAddress(authored), authored);
  const surfaces = compileEntityIntakeSurfaces(authored),
    surface = surfaces[0]!;
  assert.equal(surface.sections[0]!.collapsible, true);
  const values = {
    ...dataSurfaceDefaults(surface, surfaces),
    addressKind: "po_box",
  };
  assert.throws(() => dataSurfaceValues(surface, surfaces, values));
  assert.doesNotThrow(() =>
    dataSurfaceValues(surface, surfaces, values, "draft"),
  );
  assert.equal(
    dataSurfaceValues(surface, surfaces, { ...values, poBox: "127" }).poBox,
    "127",
  );
});
test("advanced values survive proposal serialization and draft restoration and distinguish units in hashes", async () => {
  const a = {
    ...newAddress(),
    countryCode: "MY",
    line1: "Example building",
    buildingName: "Q Sentral",
    floor: "31",
    unit: "BC13",
  };
  const first = await buildRelationshipExtensions([a], []),
    second = await buildRelationshipExtensions([{ ...a, unit: "BC14" }], []);
  assert.equal(first.addresses[0]!.buildingName, "Q Sentral");
  assert.equal(first.addresses[0]!.floor, "31");
  assert.notEqual(
    first.addresses[0]!.normalizedHash,
    second.addresses[0]!.normalizedHash,
  );
  const root: any = {
    sections: [
      {
        fields: [
          {
            control: "repeatableGroup",
            valueKey: "addresses",
            itemSurfaceKey: "partner_address_intake",
          },
        ],
      },
    ],
  };
  const restored = restoreProfileAnswers(root, [root], {
    relationshipProposals: first,
  });
  assert.equal((restored.addresses as any[])[0].unit, "BC13");
  const box = await buildRelationshipExtensions(
    [
      {
        ...newAddress(),
        countryCode: "MY",
        addressKind: "po_box",
        poBox: "127",
      },
    ],
    [],
  );
  assert.equal(box.addresses[0]!.addressKind, "po_box");
  assert.equal(box.addresses[0]!.poBox, "127");
});
