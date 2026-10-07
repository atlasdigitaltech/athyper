import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import {
  parseUiComponentContract,
  uiComponentCatalogueDdl,
  type UiComponentContract,
} from "./ui-component-contract.js";
const value: UiComponentContract = {
  id: "00000000-0000-4000-8000-000000000001",
  tenantId: null,
  componentKey: "shared.text",
  componentVersion: 1,
  componentLevel: "field_display",
  componentTier: "standard",
  manifestHash: "a".repeat(64),
  resourceOwner: "platform",
  resourceNamespace: "entity.ui",
  publicationResourceKey: "shared.text",
  publicationReleaseHash: "b".repeat(64),
  supportedDataTypes: ["string"],
  supportedPlanes: ["studio"],
  supportedSurfaceKinds: ["detail"],
  supportedModes: [],
  cardinalities: ["one"],
  optionKeys: [],
  filterOperators: [],
  compatibleDisplayIds: [],
  maskedRepresentationSafe: false,
  status: "active",
};
it("keeps the component resource closed, typed and outside draft ownership", () => {
  expect(parseUiComponentContract(value)).toEqual(value);
  for (const patch of [
    { entityId: value.id },
    { supportedPlanes: [] },
    { optionKeys: ["arbitrary"] },
    { supportedDataTypes: ["string", "string"] },
    { manifestHash: "unverified" },
  ])
    expect(() => parseUiComponentContract({ ...value, ...patch })).toThrow();
});
it("generates immutable typed catalogue storage without runtime grants or JSON declarations", () => {
  const ddl = uiComponentCatalogueDdl();
  expect(ddl).toEqual(
    readFileSync(
      new URL(
        "../../../../db/ddl/planes/studio/metadata/41_ui_component_catalogue.generated.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(ddl).toContain("FORCE ROW LEVEL SECURITY");
  expect(ddl).toContain("UI_COMPONENT_IMMUTABLE_RESOURCE");
  expect(ddl).not.toMatch(
    /jsonb|GRANT |SECURITY DEFINER|change_set_id|entity_id/,
  );
});
