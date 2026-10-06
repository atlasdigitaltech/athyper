import { expect, it } from "vitest";
import {
  coreFixture,
  coreFixtureId,
} from "../../../../contracts/meta-entity-authoring/src/normalized-core.fixtures.js";
import { layoutFixture } from "../../../../contracts/meta-entity-authoring/src/normalized-layout.fixtures.js";
import { normalizedCoreToStorage } from "./normalized-core-codec.js";
import { normalizedLayoutToStorage } from "./normalized-layout-codec.js";
import { changed, planNormalizedBranch } from "./graph-reconciliation.js";
it("reuses stable typed member identity and leaves attribution out of updates", () => {
  const row = coreFixture().field[1]!,
    before = {
      ...normalizedCoreToStorage("field", row),
      created_by: "retained",
      created_at: "retained",
      description: "old",
    };
  const plan = planNormalizedBranch(
    "field",
    [{ ...row, description: "new" }],
    [before],
  );
  expect(plan.insert).toEqual([]);
  expect(plan.remove).toEqual([]);
  expect(plan.update).toEqual([
    { id: row.id, before, values: { description: "new" } },
  ]);
  expect(
    changed(
      planNormalizedBranch(
        "field",
        [row],
        [normalizedCoreToStorage("field", row)],
      ),
    ),
  ).toBe(false);
});
it("preserves omitted families and treats explicit removal/nullable clear distinctly", () => {
  const row = coreFixture().surface[0]!,
    stored = [{ ...normalizedCoreToStorage("surface", row), icon_key: "icon" }];
  expect(changed(planNormalizedBranch("surface", undefined, stored))).toBe(
    false,
  );
  expect(planNormalizedBranch("surface", [], stored).remove).toEqual(stored);
  expect(
    planNormalizedBranch("surface", [{ ...row, iconKey: null }], stored)
      .update[0]!.values,
  ).toEqual({ icon_key: null });
});
it("requires a separate remap for field identity and binding ownership", () => {
  const row = coreFixture().field[1]!;
  expect(() =>
    planNormalizedBranch(
      "field",
      [{ ...row, fieldIdentityId: coreFixtureId(999) }],
      [normalizedCoreToStorage("field", row)],
    ),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_MEMBER_REMAP_REQUIRED" }),
  );
  const binding = layoutFixture().binding[0]!;
  expect(() =>
    planNormalizedBranch(
      "binding",
      [{ ...binding, entitySurfaceId: null, overlayId: coreFixtureId(99) }],
      [normalizedLayoutToStorage("binding", binding)],
    ),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_MEMBER_REMAP_REQUIRED" }),
  );
});
it("rejects identity substitution, bags and client-created attribution", () => {
  const row = coreFixture().field[1]!,
    stored = [normalizedCoreToStorage("field", row)];
  expect(() =>
    planNormalizedBranch("field", [{ ...row, id: coreFixtureId(99) }], stored),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_MEMBER_IDENTITY_REPLACEMENT" }),
  );
  for (const extra of [
    { typeConfig: {} },
    { createdBy: "forged" },
    { defaultSpec: {} },
  ])
    expect(() =>
      planNormalizedBranch("field", [{ ...row, ...extra }], stored),
    ).toThrow();
});
it("maps section and binding options without copying their retired layout blob", () => {
  const graph = layoutFixture(),
    row = graph.binding[0]!;
  const plan = planNormalizedBranch(
    "binding",
    [{ ...row, width: 120 }],
    [normalizedLayoutToStorage("binding", row)],
  );
  expect(plan.update[0]!.values).toEqual({ width: 120 });
  expect(
    planNormalizedBranch("section", graph.section, []).insert[0]!.values,
  ).toMatchObject({
    navigation_group_id: graph.section[0]!.navigationGroupId,
    content_kind: "fields",
    label_id: graph.section[0]!.labelId,
  });
});

it("preserves service-owned storage and parent values during ordinary typed reconciliation", () => {
  const row = coreFixture().field[1]!;
  const stored = [normalizedCoreToStorage("field", row)];
  for (const patch of [{ storageType: "forged" }, { parentFieldId: coreFixtureId(999) }]) {
    expect(() => planNormalizedBranch("field", [{ ...row, ...patch }], stored)).toThrowError(
      expect.objectContaining({ code: "AUTHORING_SERVICE_PROPERTY_IMMUTABLE" }),
    );
  }
  expect(changed(planNormalizedBranch("field", [row], stored))).toBe(false);
});
