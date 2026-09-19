import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDataAnswers,
  resolveDataInput,
  dataSurfaceValues,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
import { validateDataInput } from "../../packages/contracts/platform/entity-runtime/src/validation-messages";
const profiles: any = {
  MY: {
    accountType: "local_account",
    accountPattern: "",
    routingWidget: "hidden",
    routingRequired: false,
  },
  IN: {
    accountType: "local_account",
    accountPattern: "",
    routingWidget: "text",
    routingLabel: "IFSC",
    routingPattern: "^[A-Z]{4}0[A-Z0-9]{6}$",
    routingRequired: true,
  },
  SA: {
    accountType: "iban",
    accountPattern: "^SA[0-9]{4}[A-Z0-9]{18}$",
    routingWidget: "hidden",
    routingRequired: false,
  },
  EG: {
    accountType: "iban",
    accountPattern: "^EG[0-9]{27}$",
    routingWidget: "hidden",
    routingRequired: false,
  },
  QA: {
    accountType: "iban",
    accountPattern: "^QA[0-9]{2}[A-Z]{4}[A-Z0-9]{21}$",
    routingWidget: "hidden",
    routingRequired: false,
  },
};
const input = (key: string, extra: any = {}) => ({
  control: "input",
  key,
  valueKey: key,
  label: key,
  widget: "text",
  required: false,
  ...extra,
});
const country = input("country", {
  lookup: {
    options: Object.entries(profiles).map(([value, data]) => ({
      value,
      label: value,
      data: { ...(data as any), typeWidget: "hidden" },
    })),
  },
});
const type = input("type", {
  widget: "select",
  required: true,
  lookup: {
    options: [
      { value: "iban", label: "IBAN" },
      { value: "local_account", label: "Local account" },
    ],
  },
  referenceRules: {
    field: "country",
    value: "accountType",
    widget: "typeWidget",
  },
});
const account = input("account", {
  required: true,
  referenceRules: { field: "country", pattern: "accountPattern" },
  variants: [
    {
      when: { field: "type", operator: "equals", value: "iban" },
      format: "iban",
    },
  ],
});
const routing = input("routing", {
  referenceRules: {
    field: "country",
    widget: "routingWidget",
    label: "routingLabel",
    pattern: "routingPattern",
    required: "routingRequired",
  },
  normalize: "uppercase",
});
const surface: any = {
  sections: [{ fields: [country, type, account, routing] }],
};
for (const [code, profile] of Object.entries(profiles))
  test(`${code} derives format for new and restored rows and controls routing`, () => {
    const answers = resolveDataAnswers(surface, {
      country: code,
      type: "wrong",
    });
    assert.equal(answers.type, (profile as any).accountType);
    assert.equal(
      resolveDataInput(type as any, surface, answers).widget,
      "hidden",
    );
    assert.equal(
      resolveDataInput(routing as any, surface, answers).widget,
      code === "IN" ? "text" : "hidden",
    );
  });
const samples = {
  SA: "SA0380000000608010167519",
  EG: "EG380019000500000000263180002",
  QA: "QA58DOHB00001234567890ABCDEFG",
};
for (const [code, sample] of Object.entries(samples))
  test(`${code} validates country format and checksum, stores IBAN without spaces`, () => {
    const values = dataSurfaceValues(surface, [surface], {
      country: code,
      account: sample
        .match(/.{1,4}/g)!
        .join(" ")
        .toLowerCase(),
    });
    assert.equal(values.account, sample);
    assert.equal(values.type, "iban");
    const field = resolveDataInput(
      account as any,
      surface,
      resolveDataAnswers(surface, { country: code }),
    );
    assert.ok(validateDataInput(field, sample.slice(0, -1) + "0"));
    assert.ok(validateDataInput(field, samples[code === "SA" ? "QA" : "SA"]));
  });
test("local accounts preserve leading zeros and India validates IFSC", () => {
  assert.equal(
    dataSurfaceValues(surface, [surface], { country: "MY", account: "001234" })
      .account,
    "001234",
  );
  assert.throws(() =>
    dataSurfaceValues(surface, [surface], { country: "IN", account: "001234" }),
  );
  assert.throws(() =>
    dataSurfaceValues(surface, [surface], {
      country: "IN",
      account: "001234",
      routing: "ABCD1123456",
    }),
  );
  assert.equal(
    dataSurfaceValues(surface, [surface], {
      country: "IN",
      account: "001234",
      routing: "abcd0123456",
    }).routing,
    "ABCD0123456",
  );
});

test("hydrated country options preserve false and true routing requirements across the wire parser", async () => {
  const { parseIntakeDataField } =
    await import("../../packages/contracts/platform/entity-runtime/src/intake-data");
  const parsed = parseIntakeDataField({
    ...country,
    columnSpan: 6,
    lookup: { ...country.lookup, sourceKey: "control.bank_country" },
  });
  assert.equal(parsed.control, "input");
  if (parsed.control !== "input") throw Error("Expected input");
  assert.equal(
    parsed.lookup?.options?.find((o) => o.value === "MY")?.data
      ?.routingRequired,
    false,
  );
  assert.equal(
    parsed.lookup?.options?.find((o) => o.value === "IN")?.data
      ?.routingRequired,
    true,
  );
});

test('country confirmation depends on lost details or a changed derived account format', async () => {
 const {dataInputChangeRequiresConfirmation}=await import('../../packages/contracts/platform/entity-runtime/src/intake-data-values');
 const field:any={...country,clearOnChange:{fields:['type','routing'],message:'Change',confirmLabel:'Change',cancelLabel:'Keep'}};
 assert.equal(dataInputChangeRequiresConfirmation(field,surface,{country:'MY'},'IN'),false);
 assert.equal(dataInputChangeRequiresConfirmation(field,surface,{country:'MY'},'SA'),true);
 assert.equal(dataInputChangeRequiresConfirmation(field,surface,{country:'IN',routing:'ABCD0123456'},'MY'),true);
 assert.equal(dataInputChangeRequiresConfirmation(field,surface,{country:'IN',routing:'ABCD0123456'},'IN'),false);
});
