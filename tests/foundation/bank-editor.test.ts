import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseIntakeDataField,
  type IntakeInputField,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data";
import {
  resolveDataInput,
  changedDataInput,
  dataSurfaceValues,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
import { validateDataInput } from "../../packages/contracts/platform/entity-runtime/src/validation-messages";
const bank = parseIntakeDataField({
  control: "input",
  key: "choice",
  valueKey: "selected",
  label: "Bank",
  required: true,
  widget: "select",
  columnSpan: 6,
  lookup: {
    sourceKey: "shared.bank_institution",
    filterBy: [{ field: "country", property: "countryCode" }],
    copyFields: [
      { from: "name", to: "name" },
      { from: "bic", to: "bic" },
    ],
    options: [
      {
        value: "a",
        label: "Bank A",
        data: { countryCode: "MY", name: "Bank A", bic: "MBBEMYKL" },
      },
      {
        value: "b",
        label: "Bank B",
        data: { countryCode: "SG", name: "Bank B", bic: "DBSSSGSG" },
      },
    ],
  },
  clearOnChange: {
    fields: ["branch"],
    message: "Clear branch?",
    confirmLabel: "Confirm",
    cancelLabel: "Cancel",
  },
}) as IntakeInputField;
const text = (key: string): IntakeInputField => ({
  control: "input",
  key,
  valueKey: key,
  label: key,
  required: false,
  widget: "text",
  columnSpan: 6,
});
const surface = {
  schemaVersion: 1 as const,
  key: "bank",
  title: "Bank",
  columns: 1 as const,
  sections: [
    {
      key: "main",
      fields: [
        text("country"),
        bank,
        text("name"),
        text("bic"),
        text("branch"),
        text("accountNumber"),
      ],
    },
  ],
};
test("dependent lookup scopes eligibility and copies only declared values without clearing the account", () => {
  const before = {
    country: "MY",
    selected: "",
    branch: "previous",
    accountNumber: "12345",
  };
  const resolved = resolveDataInput(bank, surface, before);
  assert.deepEqual(
    resolved.lookup?.options?.map((o) => o.value),
    ["a"],
  );
  const next = changedDataInput(resolved, before, "a");
  assert.equal(next.name, "Bank A");
  assert.equal(next.bic, "MBBEMYKL");
  assert.equal(next.branch, "");
  assert.equal(next.accountNumber, "12345");
  assert.throws(
    () => dataSurfaceValues(surface, [surface], { ...next, selected: "b" }),
    /Bank/,
  );
  assert.deepEqual(
    resolveDataInput(bank, surface, { country: "" }).lookup?.options,
    [],
  );
});
test("metadata variants retain derived hidden values and choose identifier checks", () => {
  const input = parseIntakeDataField({
    ...text("identifier"),
    widget: "password",
    variants: [
      {
        when: { field: "kind", operator: "equals", value: "iban" },
        label: "IBAN",
        format: "iban",
      },
      {
        when: { field: "kind", operator: "equals", value: "local" },
        label: "Account number",
        format: "none",
      },
    ],
  }) as IntakeInputField;
  const localSurface = {
    ...surface,
    sections: [{ key: "main", fields: [text("kind"), input] }],
  };
  const iban = resolveDataInput(input, localSurface, { kind: "iban" });
  assert.equal(iban.format, "iban");
  assert.equal(validateDataInput(iban, "DE89370400440532013000"), undefined);
  assert.ok(validateDataInput(iban, "DE00370400440532013000"));
  assert.equal(
    resolveDataInput(input, localSurface, { kind: "local" }).format,
    undefined,
  );
  const derived = { ...text("name"), widget: "hidden" as const };
  assert.equal(
    dataSurfaceValues(
      { ...surface, sections: [{ key: "main", fields: [derived] }] },
      [],
      { name: "Bank A" },
    ).name,
    "Bank A",
  );
  assert.ok(validateDataInput({ ...text("bic"), format: "bic" }, "MBBYEXX"));
  assert.equal(
    validateDataInput({ ...text("bic"), format: "bic" }, "MBBEMYKL"),
    undefined,
  );
  assert.throws(() => parseIntakeDataField({ ...input, format: "arbitrary" }));
});
