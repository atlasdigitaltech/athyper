import { readFileSync } from "node:fs";
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

const seedSql = readFileSync(
  new URL(
    "../../server/db/ddl/common/control/12_banking_reference_seed.sql",
    import.meta.url,
  ),
  "utf8",
);
const countrySql = readFileSync(
  new URL(
    "../../server/db/ddl/common/shared/reference-data/001_country.sql",
    import.meta.url,
  ),
  "utf8",
);
const seededCountries = [
  ...countrySql.matchAll(/\('([A-Z]{2})','[A-Z]{3}','\d{3}'/g),
].map((match) => match[1]);
const captureRules = new Map(
  [
    ...seedSql.matchAll(
      /^\('([A-Z]{2})\.CAPTURE',[^\n]*?,(?:'(\^[^']*)'|NULL),(?:'([A-Z]{2})'|NULL),(true|false),/gm,
    ),
  ].map((match) => [
    match[1],
    { pattern: match[2], ibanPrefix: match[3], checksum: match[4] === "true" },
  ]),
);

test("every shared.country has exactly one account capture profile", () => {
  assert.deepEqual(
    seededCountries.filter((code) => !captureRules.has(code)),
    [],
  );
  assert.equal(captureRules.size, new Set(seededCountries).size);
});

test("IBAN capture profiles accept registry samples and reject broken checksums", () => {
  const registrySamples = [
    "GB82WEST12345698765432",
    "DE89370400440532013000",
    "FR1420041010050500013M02606",
    "NL91ABNA0417164300",
    "IT60X0542811101000000123456",
    "SA0380000000608010167519",
    "EG380019000500000000263180002",
    "QA58DOHB00001234567890ABCDEFG",
    "MU17BOMM0101101030300200000MUR",
    "LC55HEMM000100010012001200023015",
    "BR1800360305000010009795493C1",
    "XK051212012345678906",
  ];
  const mod97 = (iban: string) =>
    [...(iban.slice(4) + iban.slice(0, 4))].reduce(
      (rest, character) =>
        (rest * (/[0-9]/.test(character) ? 10 : 100) +
          parseInt(character, 36)) %
        97,
      0,
    ) === 1;
  for (const sample of registrySamples) {
    const rule = captureRules.get(sample.slice(0, 2))!;
    assert.ok(rule?.pattern, `${sample.slice(0, 2)} carries no IBAN pattern`);
    assert.equal(rule.ibanPrefix, sample.slice(0, 2));
    assert.equal(rule.checksum, true);
    assert.match(sample, new RegExp(rule.pattern!));
    assert.ok(mod97(sample), `${sample} fails mod-97`);
    assert.ok(!mod97(sample.slice(0, 2) + "00" + sample.slice(4)));
  }
});

test("IBAN patterns are anchored and fixed length, local profiles carry no prefix", () => {
  for (const [code, rule] of captureRules) {
    if (!rule.ibanPrefix) {
      assert.ok(!rule.checksum, `${code} validates a checksum with no IBAN`);
      continue;
    }
    assert.ok(rule.pattern?.startsWith(`^${rule.ibanPrefix}`), code);
    assert.ok(rule.pattern?.endsWith("$"), code);
    assert.ok(!/[+*?]|\{\d+,/.test(rule.pattern!), `${code} is variable length`);
  }
});

const bankMasterSql = readFileSync(
  new URL(
    "../../server/db/ddl/common/shared/reference-data/010_bank_master.sql",
    import.meta.url,
  ),
  "utf8",
);
const seededBanks = [
  ...bankMasterSql.matchAll(
    /^ {2}\('((?:[^']|'')*)','([A-Z]{2})','bank','[\d-]+','swift\.bic-directory','([A-Z0-9]{8})'\)/gm,
  ),
].map(([, name, country, bic]) => ({ name: name!, country: country!, bic: bic! }));

test("seeded banks carry one BIC each, in their own jurisdiction", () => {
  assert.ok(seededBanks.length >= 50, `parsed ${seededBanks.length} banks`);
  for (const bank of seededBanks)
    // ISO 9362 positions 5-6; shared.bank_identifier enforces this server-side.
    assert.equal(bank.bic.slice(4, 6), bank.country, bank.name);
  // shared.v_bank_directory only surfaces an identifier when exactly one matches.
  assert.equal(new Set(seededBanks.map((b) => b.bic)).size, seededBanks.length);
  assert.equal(new Set(seededBanks.map((b) => b.name)).size, seededBanks.length);
});

test("the expanded test countries carry a meaningful bank list", () => {
  for (const country of ["SA", "MY", "EG"])
    assert.ok(
      seededBanks.filter((b) => b.country === country).length >= 10,
      `${country} has too few banks to test against`,
    );
  // Saudi bank codes are the two digits at IBAN positions 5-6, so they must be
  // distinct or shared.v_bank_directory silently returns no national_bank_code.
  const sama = [
    ...bankMasterSql.matchAll(
      /'national_bank_code','sama','SA','(\d{2})'/g,
    ),
  ].map(([, code]) => code!);
  assert.equal(sama.length, 10);
  assert.equal(new Set(sama).size, sama.length);
});

test("synthetic branch data stays separable from sourced rows", () => {
  const synthetic = "athyper.representative-branch";
  // Everything invented must be removable by source or namespace alone.
  assert.ok(bankMasterSql.includes(`DELETE FROM shared.bank_branch WHERE source='${synthetic}'`));
  assert.match(bankMasterSql, /scheme_namespace='athyper\.representative'/);
  const branchCodes = [
    ...bankMasterSql.matchAll(/'national_branch_code','([a-z.]+)'/g),
  ].map(([, namespace]) => namespace!);
  assert.ok(branchCodes.length > 0);
  assert.deepEqual(new Set(branchCodes), new Set(["athyper.representative"]));
});
