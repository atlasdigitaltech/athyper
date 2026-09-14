import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveDataInput,
  changedDataInput,
} from "../../packages/contracts/platform/entity-runtime/src/intake-data-values";
import { validateDataInput } from "../../packages/contracts/platform/entity-runtime/src/validation-messages";
import {
  buildRelationshipExtensions,
  newAddress,
  restoreProfileAnswers,
} from "../../packages/planes/neon/business-partner/src/request-relationships";
const country: any = {
  control: "input",
  key: "country",
  valueKey: "countryCode",
  label: "Country",
  widget: "select",
  required: true,
  clearOnChange: { fields: ["stateRegionCode", "region"] },
  lookup: {
    options: [
      {
        value: "MY",
        label: "Malaysia",
        data: {
          regionLabel: "State",
          postalLabel: "Postcode",
          postalPattern: "^\\d{5}$",
        },
      },
      {
        value: "GB",
        label: "United Kingdom",
        data: {
          regionLabel: "County",
          postalLabel: "Postcode",
          postalPattern: "^[A-Z]{2}[0-9] [0-9][A-Z]{2}$",
        },
      },
    ],
  },
};
const region: any = {
  control: "input",
  key: "state",
  valueKey: "stateRegionCode",
  label: "Region",
  widget: "select",
  required: false,
  referenceRules: { field: "countryCode", label: "regionLabel" },
  lookup: {
    filterBy: [{ field: "countryCode", property: "countryCode" }],
    copyFields: [{ from: "name", to: "region" }],
    options: [
      {
        value: "MY-10",
        label: "Selangor",
        data: { countryCode: "MY", name: "Selangor" },
      },
      {
        value: "US-CA",
        label: "California",
        data: { countryCode: "US", name: "California" },
      },
    ],
  },
};
const postal: any = {
  control: "input",
  key: "postal",
  valueKey: "postalCode",
  label: "Postal code",
  widget: "text",
  required: false,
  referenceRules: {
    field: "countryCode",
    label: "postalLabel",
    pattern: "postalPattern",
  },
};
const surface: any = { sections: [{ fields: [country, region, postal] }] };
test("subdivisions filter by country, copy names, and reject foreign codes", () => {
  const resolved = resolveDataInput(region, surface, { countryCode: "MY" });
  assert.equal(resolved.label, "State");
  assert.deepEqual(
    resolved.lookup?.options?.map((x) => x.value),
    ["MY-10"],
  );
  assert.equal(validateDataInput(resolved, "US-CA")?.code, "option");
  assert.equal(
    changedDataInput(resolved, { countryCode: "MY" }, "MY-10").region,
    "Selangor",
  );
  assert.equal(
    resolveDataInput(region, surface, { countryCode: "SG" }).lookup?.options
      ?.length,
    0,
  );
});
test("country changes clear subdivision while retaining street and postal text; new country revalidates", () => {
  const old = {
    countryCode: "MY",
    stateRegionCode: "MY-10",
    region: "Selangor",
    line1: "Example Tower",
    postalCode: "01234",
  };
  assert.equal(
    validateDataInput(resolveDataInput(postal, surface, old), old.postalCode),
    undefined,
  );
  const next = changedDataInput(country, old, "GB");
  assert.equal(next.stateRegionCode, "");
  assert.equal(next.region, "");
  assert.equal(next.line1, old.line1);
  assert.equal(next.postalCode, "01234");
  assert.equal(
    validateDataInput(resolveDataInput(postal, surface, next), next.postalCode)
      ?.code,
    "value",
  );
  assert.equal(
    validateDataInput(resolveDataInput(postal, surface, next), ""),
    undefined,
  );
});
test("subdivision codes survive proposals and draft restore; legacy text restores as manual", async () => {
  const proposals = await buildRelationshipExtensions(
    [
      {
        ...newAddress(),
        countryCode: "MY",
        region: "Selangor",
        stateRegionCode: "MY-10",
        regionEntryMode: "directory",
        postalCode: "01234",
      },
    ],
    [],
  );
  assert.equal(proposals.addresses[0]?.stateRegionCode, "MY-10");
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
    relationshipProposals: proposals,
  });
  assert.equal((restored.addresses as any[])[0].stateRegionCode, "MY-10");
  assert.equal((restored.addresses as any[])[0].postalCode, "01234");
  const legacy = restoreProfileAnswers(root, [root], {
    relationshipProposals: {
      addresses: [{ countryCode: "MY", region: "Selangor" }],
    },
  });
  assert.equal((legacy.addresses as any[])[0].regionEntryMode, "manual");
});
