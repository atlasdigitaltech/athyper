import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCollectionPresentation,
  parseEntityIntakeSurfaces,
} from "../../packages/contracts/platform/entity-runtime/src/intake-surface";
const presentation = {
  renderer: "bank-accounts",
  summary: [{ field: "secret", format: "masked" }],
  emptyText: "No entries",
  editLabel: "Edit",
  doneLabel: "Done",
  issuesLabel: "{count} issues",
};
const input = {
  control: "input",
  key: "secret",
  valueKey: "secret",
  label: "Identifier",
  widget: "password",
  required: true,
  columnSpan: 6,
};
const surfaces = (p: unknown) => [
  {
    schemaVersion: 1,
    key: "root",
    title: "Root",
    columns: 1,
    sections: [
      {
        key: "main",
        fields: [
          {
            control: "repeatableGroup",
            key: "entries",
            valueKey: "entries",
            label: "Entries",
            itemLabel: "Entry",
            addLabel: "Add",
            removeLabel: "Remove",
            itemSurfaceKey: "item",
            minItems: 0,
            maxItems: 10,
            columnSpan: 12,
            presentation: p,
          },
        ],
      },
    ],
  },
  {
    schemaVersion: 1,
    key: "item",
    title: "Item",
    columns: 1,
    sections: [{ key: "main", fields: [input] }],
  },
];
test("collection metadata survives parsing and rejects unsafe or incompatible summaries", () => {
  const parsed = parseEntityIntakeSurfaces(surfaces(presentation));
  assert.deepEqual(
    (parsed[0]!.sections[0]!.fields[0] as any).presentation,
    presentation,
  );
  for (const override of [
    { renderer: "javascript" },
    { summary: [] },
    { summary: [{ field: "secret", format: "html" }] },
    { summary: [{ field: "secret" }, { field: "secret" }] },
    { onClick: "execute" },
  ])
    assert.throws(() =>
      parseCollectionPresentation({ ...presentation, ...override }),
    );
  assert.throws(() =>
    parseEntityIntakeSurfaces(
      surfaces({ ...presentation, summary: [{ field: "missing" }] }),
    ),
  );
  assert.throws(() =>
    parseEntityIntakeSurfaces(
      surfaces({
        ...presentation,
        summary: [{ field: "secret", format: "count" }],
      }),
    ),
  );
});
