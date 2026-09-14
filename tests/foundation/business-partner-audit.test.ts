import test from "node:test";
import assert from "node:assert/strict";
import { createBusinessPartnerFoundationDefinition } from "../../server/packages/services/publication/src/business-partner-foundation-definition";
import { withBusinessPartnerDataSurfaces } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";
import { provisionBusinessPartnerIntakeGraph } from "../../server/db/scripts/provisioning/business-partner-intake-graph";
import {
  withBusinessPartnerBankEditor,
  withCompactBankCopy,
} from "../../server/db/scripts/provisioning/business-partner-bank-editor";
import {
  withBusinessPartnerAddressRegion,
  withBusinessPartnerAdvancedAddress,
} from "../../server/db/scripts/provisioning/business-partner-address-editor";
import {
  withBusinessPartnerCollectionPresentations,
  withBusinessPartnerProfilePresentations,
} from "../../server/db/scripts/provisioning/business-partner-collection-presentations";
import { withBusinessPartnerRequestCapture } from "../../server/db/scripts/provisioning/business-partner-request-capture";
import { compileEntityIntakeSurfaces } from "../../packages/contracts/platform/entity-runtime/src/intake-surface-authoring";
import {
  dataSurfaceValues,
  dataSurfaceDefaults,
  resolveDataItemSurface,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
import {
  isListViewAllowed,
  constrainEmbeddedViewState,
} from "../../packages/platform/entity/runtime/list-view/src/view-policy";

const transforms = [
  withBusinessPartnerBankEditor,
  withCompactBankCopy,
  withBusinessPartnerAddressRegion,
  withBusinessPartnerAdvancedAddress,
  withBusinessPartnerCollectionPresentations,
  withBusinessPartnerProfilePresentations,
  withBusinessPartnerRequestCapture,
  provisionBusinessPartnerIntakeGraph,
];
test("all public profile transforms reject another entity before modifying or returning its graph", () => {
  const other = { entity: { entityCode: "product" }, surfaces: [] } as any;
  for (const transform of transforms)
    assert.throws(() => transform(other), /Business Partner graph required/);
  assert.deepEqual(other, { entity: { entityCode: "product" }, surfaces: [] });
});

test("provisioning repairs old address flags and scopes optional fields to full profile", () => {
  const definition = createBusinessPartnerFoundationDefinition({
    request: "1".repeat(64),
    eligibility: "2".repeat(64),
    meshProfile: "3".repeat(64),
    meshMatch: "4".repeat(64),
  });
  const source = withBusinessPartnerDataSurfaces(
    {
      entity: { entityCode: "business_partner" },
      fields: [
        {
          id: "canonical-name",
          fieldKey: "name",
          valueOrigin: "stored",
          storagePath: "name",
        },
      ],
      operations: [],
    } as any,
    definition.formDescriptors.supplierRequest as any,
  );
  const graph = provisionBusinessPartnerIntakeGraph(source);
  assert.deepEqual(provisionBusinessPartnerIntakeGraph(graph), graph);
  const old = structuredClone(graph) as any;
  for (const binding of old.surfaceFieldBindings)
    if (["address_line1", "address_city"].includes(binding.bindingKey))
      binding.displayConfig.required = false;
  assert.deepEqual(provisionBusinessPartnerIntakeGraph(old), graph);
  const surfaces = compileEntityIntakeSurfaces(graph).map((s) => ({
    ...s,
    sections: s.sections.map((section) => ({
      ...section,
      fields: section.fields.map((f) =>
        f.control === "input" && f.lookup?.sourceKey === "iso.country"
          ? {
              ...f,
              lookup: {
                ...f.lookup,
                options: [{ value: "MY", label: "Malaysia" }],
              },
            }
          : f,
      ),
    })),
  }));
  const details = surfaces.find((s) => s.key === "intake_details")!;
  const fields = details.sections.flatMap((s) => s.fields);
  const group = fields.find(
    (f) =>
      f.control === "repeatableGroup" &&
      f.itemSurfaceKey === "partner_address_intake",
  )!;
  assert.equal(group.control, "repeatableGroup");
  if (group.control !== "repeatableGroup") return;
  const subset = {
    ...details,
    sections: [
      {
        key: "test",
        title: "Test",
        fields: fields.filter(
          (f) => f.key === group.key || f.key === "details_profile_mode",
        ),
      },
    ],
  } as any;
  const item = surfaces.find((s) => s.key === group.itemSurfaceKey)!;
  const purpose = item.sections
    .flatMap((s) => s.fields)
    .find((f) => f.control === "input" && f.valueKey === "purpose") as any;
  const row = {
    ...dataSurfaceDefaults(item, surfaces),
    key: "address-1",
    purpose: purpose.lookup.options[0].value,
    countryCode: "MY",
    isPrimary: true,
  };
  const validate = (profileMode: string, mode: "draft" | "submit" = "submit") =>
    dataSurfaceValues(
      subset,
      surfaces,
      { profileMode, [group.valueKey]: [row] },
      mode,
    );
  assert.throws(() => validate("standard"), /Address line 1/);
  assert.doesNotThrow(() => validate("full"));
  assert.doesNotThrow(() => validate("standard", "draft"));
  for (const profileMode of ["standard", "full", "standard"]) {
    const item = resolveDataItemSurface(
      group,
      details,
      { profileMode },
      surfaces,
    );
    const line = item.sections
      .flatMap((s) => s.fields)
      .find((f) => f.control === "input" && f.valueKey === "line1");
    assert.equal(
      line?.control === "input" && line.required,
      profileMode === "standard",
    );
  }
});

test("reset retains locked or excluded view identity while applying settings", () => {
  const current = {
    savedViewId: "mine",
    query: "partner",
    group: "country",
  } as any;
  const reset = {
    savedViewId: "system",
    query: "partner",
    group: undefined,
    filters: [],
  } as any;
  for (const views of [
    { allowSwitching: false },
    { allowSwitching: true, allowedViewKeys: ["mine"] },
  ]) {
    const next = constrainEmbeddedViewState(reset, current, views as any);
    assert.equal(next.savedViewId, "mine");
    assert.equal(next.group, undefined);
    assert.deepEqual(next.filters, []);
    assert.equal(next.query, "partner");
  }
});

test("view policy handles standard aliases and excludes stale views consistently", () => {
  assert.equal(
    isListViewAllowed(
      { savedViewId: "standard.active", standardViewKey: "active" },
      ["active"],
    ),
    true,
  );
  assert.equal(
    isListViewAllowed({ standardViewKey: "active" }, ["standard.active"]),
    true,
  );
  assert.equal(
    isListViewAllowed({ savedViewId: "private" }, ["active"]),
    false,
  );
  assert.equal(
    isListViewAllowed({ savedViewId: "system", standardViewKey: "private" }, [
      "system",
    ]),
    false,
  );
});
