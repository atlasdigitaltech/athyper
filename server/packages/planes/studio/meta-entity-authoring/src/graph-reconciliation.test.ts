import { expect, it } from "vitest";
import { changed, planBranch } from "./graph-reconciliation.js";

const before = {
  id: "field-a",
  field_key: "code",
  description: "Old",
  type_config: { kind: "string", max: 2 },
  created_by: "original",
  created_at: "then",
  updated_by: null,
};
it("preserves identity and creation evidence, and writes only changed authored values", () => {
  const plan = planBranch(
    "entity_field",
    [
      {
        id: "field-a",
        fieldKey: "code",
        description: "New",
      },
    ],
    [before],
  );
  expect(plan.insert).toEqual([]);
  expect(plan.remove).toEqual([]);
  expect(plan.update).toEqual([
    { id: "field-a", before, values: { description: "New" } },
  ]);
});
it("keeps omitted properties and families; explicit null clears and [] removes", () => {
  expect(changed(planBranch("entity_field", undefined, [before]))).toBe(false);
  expect(
    changed(
      planBranch(
        "entity_field",
        [{ id: "field-a", fieldKey: "code" }],
        [before],
      ),
    ),
  ).toBe(false);
  expect(
    planBranch(
      "entity_field",
      [{ id: "field-a", fieldKey: "code", description: null }],
      [before],
    ).update[0]?.values,
  ).toEqual({ description: null });
  expect(planBranch("entity_field", [], [before]).remove).toEqual([before]);
});
it("compares JSON structurally and preserves an unchanged JSONB value", () => {
  expect(
    changed(
      planBranch(
        "entity_field",
        [
          {
            id: "field-a",
            fieldKey: "code",
            typeConfig: { max: 2, kind: "string" },
          },
        ],
        [before],
      ),
    ),
  ).toBe(false);
});
it("legacy omitted IDs resolve only the same scoped logical member", () => {
  expect(
    planBranch(
      "entity_field",
      [{ fieldKey: "code", description: "New" }],
      [before],
    ).update[0]?.id,
  ).toBe("field-a");
  expect(
    planBranch(
      "entity_flow",
      [{ flowKey: "flow", title: "Changed" }],
      [{ id: "flow-id", flow_key: "flow", title: "Original" }],
    ).update[0]?.id,
  ).toBe("flow-id");
});
it("rejects duplicate identities/coordinates and implicit identity replacement", () => {
  expect(() =>
    planBranch(
      "entity_field",
      [
        { id: "field-a", fieldKey: "code" },
        { id: "field-a", fieldKey: "other" },
      ],
      [before],
    ),
  ).toThrow(/entity_field/);
  try {
    planBranch("entity_field", [{ id: "new-a", fieldKey: "code" }], [before]);
    throw Error("expected rejection");
  } catch (error) {
    expect(error).toMatchObject({
      code: "AUTHORING_MEMBER_IDENTITY_REPLACEMENT",
    });
  }
  expect(() =>
    planBranch("entity_field", [{ fieldKey: "x" }, { fieldKey: "x" }], []),
  ).toThrow();
});
it("rejects unqualified rename/reparent instead of deleting and recreating", () => {
  expect(() =>
    planBranch(
      "entity_field",
      [{ id: "field-a", fieldKey: "renamed" }],
      [before],
    ),
  ).toThrow();
  expect(() =>
    planBranch(
      "entity_key_field",
      [{ id: "binding", entityKeyId: "other", entityFieldId: "f" }],
      [{ id: "binding", entity_key_id: "old", entity_field_id: "f" }],
    ),
  ).toThrow();
});
it("allocates identity only for genuinely new logical members", () => {
  const plan = planBranch(
    "entity_field",
    [{ fieldKey: "new", description: "New" }, { fieldKey: "code" }],
    [before],
  );
  expect(plan.insert).toHaveLength(1);
  expect(plan.insert[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  expect(plan.update).toEqual([]);
  expect(plan.remove).toEqual([]);
});

it("rejects forged attribution and unknown members rather than silently discarding them", () => {
  for (const property of ["createdBy", "typeConfiguration", "unregistered"]) {
    expect(() =>
      planBranch(
        "entity_field",
        [{ id: "field-a", fieldKey: "code", [property]: "forged" }],
        [before],
      ),
    ).toThrow("no registered save mapping");
  }
});

it("rejects non-JSON member properties before evaluating getters", () => {
  const accessor = {
    fieldKey: "code",
    get description() {
      throw Error("GETTER_MUST_NOT_EXECUTE");
    },
  };
  expect(() => planBranch("entity_field", [accessor], [before])).toThrow(
    "reload the draft",
  );
  expect(() =>
    planBranch(
      "entity_field",
      [{ fieldKey: "code", [Symbol("hidden")]: true }],
      [before],
    ),
  ).toThrow("no registered save mapping");
});
