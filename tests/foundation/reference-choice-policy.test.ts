import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRecentChoicePolicy,
  parseEntityIntakeSurfaces,
} from "../../packages/contracts/platform/entity-runtime/src/index";
import { withBusinessPartnerReferenceHistory } from "../../server/db/scripts/provisioning/business-partner-data-surfaces";

test("reference history policy survives descriptor parsing and rejects unbounded or unknown settings", () => {
  const recent = {
    enabled: true,
    limit: 5,
    persistence: "server",
    scope: "referenceSource",
    retentionDays: 90,
  };
  const surfaces = parseEntityIntakeSurfaces([
    {
      schemaVersion: 1,
      key: "details",
      title: "Details",
      columns: 1,
      sections: [
        {
          key: "identity",
          fields: [
            {
              control: "input",
              key: "country",
              valueKey: "country",
              label: "Country",
              columnSpan: 12,
              widget: "select",
              required: true,
              lookup: { sourceKey: "iso.country", recent },
            },
          ],
        },
      ],
    },
  ]);
  assert.deepEqual(
    (surfaces[0].sections[0].fields[0] as any).lookup.recent,
    recent,
  );
  for (const override of [
    { retentionDays: 91 },
    { limit: 0 },
    { persistence: "cookie" },
    { scope: "global" },
    { principalId: "someone" },
  ])
    assert.throws(() => parseRecentChoicePolicy({ ...recent, ...override }));
});
test("existing authoring upgrade preserves explicit browser policy and is idempotent", () => {
  const source = {
    entity: { entityCode: "business_partner" },
    surfaces: [{ id: "details", layoutConfig: { renderer: "intake" } }],
    surfaceFieldBindings: [
      {
        entitySurfaceId: "details",
        widgetKey: "input",
        displayConfig: { lookup: { sourceKey: "iso.country" } },
      },
      {
        entitySurfaceId: "details",
        widgetKey: "input",
        displayConfig: {
          lookup: {
            sourceKey: "iso.country",
            recent: { enabled: false, limit: 5 },
          },
        },
      },
    ],
  } as any;
  const upgraded = withBusinessPartnerReferenceHistory(source);
  assert.equal(
    (upgraded.surfaceFieldBindings![0].displayConfig!.lookup as any).recent
      .persistence,
    "server",
  );
  assert.equal(
    (upgraded.surfaceFieldBindings![1].displayConfig!.lookup as any).recent
      .enabled,
    false,
  );
  assert.equal(
    source.surfaceFieldBindings[0].displayConfig.lookup.recent,
    undefined,
  );
  assert.deepEqual(withBusinessPartnerReferenceHistory(upgraded), upgraded);
});
