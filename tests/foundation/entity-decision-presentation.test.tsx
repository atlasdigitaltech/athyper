import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createEffectiveLocalization } from "../../packages/platform/foundation/i18n/src/index";
import { IntlProvider } from "../../packages/platform/foundation/i18n/src/react";
import { Fields } from "../../packages/platform/entity/runtime/form-detail/src/section-primitives";
Object.assign(globalThis, { React });

test("metadata date-only rendering preserves the calendar date in a negative timezone", () => {
  const html = renderToStaticMarkup(
    <IntlProvider
      localization={createEffectiveLocalization({
        formatLocale: "en-GB",
        timeZone: "America/Los_Angeles",
      })}
      messages={{}}
    >
      <Fields
        fields={[
          { key: "from", temporalType: "date" },
          { key: "at", temporalType: "datetime" },
        ]}
        values={{ from: "2025-01-01", at: "2025-01-01T00:00:00Z" }}
      />
    </IntlProvider>,
  );
  assert.match(html, /1 Jan 2025/);
  assert.match(html, /31 Dec 2024/);
});
test("nested scope coordinates use metadata labels and omit absent coordinates", () => {
  const html = renderToStaticMarkup(
    <Fields
      fields={[
        {
          key: "coverage",
          itemFields: [
            {
              key: "scope_group",
              label: { labelKey: "scope.group", defaultText: "Group" },
            },
            {
              key: "mode",
              label: { labelKey: "scope.mode", defaultText: "Selection" },
              options: [
                {
                  value: "all",
                  label: {
                    labelKey: "scope.all",
                    defaultText: "All (membership not evaluated)",
                  },
                },
              ],
            },
            {
              key: "company",
              label: { labelKey: "scope.company", defaultText: "Company" },
            },
          ],
        },
      ]}
      values={{ coverage: [{ scope_group: 1, mode: "all", company: null }] }}
    />,
  );
  assert.match(html, /Group/);
  assert.match(html, /membership not evaluated/);
  assert.doesNotMatch(html, /Company/);
});
