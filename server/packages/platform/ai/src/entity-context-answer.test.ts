import { expect, it } from "vitest";
import { entityContextAnswer } from "./entity-context-answer.js";
const render = (
  name: string,
  result: unknown,
  error = false,
  admitted = true,
) =>
  entityContextAnswer(
    [
      {
        type: "tool_result",
        callId: "c",
        toolName: name,
        result,
        isError: error,
      },
    ],
    admitted
      ? [
          {
            name,
            description: "Read",
            inputSchema: {},
            entitySection: {
              entityCode: "example",
              sectionKey: name,
              aliases: [],
            },
          },
        ]
      : [],
  );
const fields = {
  coverage: "authorized_summary_fields",
  readOnlyEntity: true,
  fields: [{ key: "name", label: "Name", type: "string", required: true }],
};
it("renders the complete authorized field declaration without implying validation or write authority", () => {
  const answer = render("entity_explain_fields", fields)!;
  expect(answer).toContain("Name (name)");
  expect(answer).toContain("read-only");
  expect(answer).toContain("not input validation results");
  expect(answer).not.toContain("hidden_field");
});
it("requires successful admitted typed results", () => {
  expect(render("entity_explain_fields", fields, true)).toBeUndefined();
  expect(render("entity_explain_fields", fields, false, false)).toBeUndefined();
  expect(
    render("entity_explain_fields", { ...fields, coverage: "raw_descriptor" }),
  ).toBeUndefined();
  expect(
    render("entity_explain_fields", {
      ...fields,
      fields: [{ key: "secret", label: { storage: "secret" } }],
    }),
  ).toBeUndefined();
});
it("distinguishes uncaptured fields from unchanged fields, including null values", () => {
  const answer = render("entity_compare_snapshots", {
    coverage: "currently_authorized_captured_root_fields",
    from: "previous",
    to: "current",
    fields: [
      {
        key: "name",
        label: "Name",
        before: { state: "uncaptured" },
        after: { state: "value", value: "Current" },
        changed: false,
      },
      {
        key: "empty",
        label: "Empty",
        before: { state: "value", value: null },
        after: { state: "value", value: null },
        changed: false,
      },
      {
        key: "status",
        label: "Status",
        before: { state: "value", value: "old" },
        after: { state: "value", value: "new" },
        changed: true,
      },
    ],
  })!;
  expect(answer).toContain("1 changed, 1 with unknown capture coverage");
  expect(answer).toContain(
    "- Name: Unknown (not captured) → Current (Unknown).",
  );
  expect(answer).toContain("- Empty: null → null (Unchanged).");
  expect(answer).toContain("not the live record");
});
it("keeps untrusted labels as inert prose and neutralizes inline formatting", () => {
  const answer = render("entity_explain_fields", {
    ...fields,
    fields: [
      {
        key: "name",
        label: "**bold** `code`",
        type: "string",
        required: false,
      },
    ],
  })!;
  expect(answer).toContain("＊＊bold＊＊ ｀code｀");
});

it("bounds snapshot absence claims to the authorized date range", () => {
  const answer = render("entity_read_snapshots", {
    coverage: "authorized_snapshots_in_default_date_range",
    items: [],
    hasMore: false,
  })!;
  expect(answer).toContain("default date range");
  expect(answer).toContain("not all record history");
});
it("retains root/reply coverage and withholds tombstoned text", () => {
  const answer = render("entity_read_comments", {
    coverage: "authorized_root_comments",
    items: [
      {
        id: "comment",
        authorId: "actor",
        text: "deleted-secret",
        tombstone: true,
      },
    ],
    hasMore: true,
  })!;
  expect(answer).toContain("root comments");
  expect(answer).toContain("partial page");
  expect(answer).toContain("Read reply threads separately");
  expect(answer).not.toContain("deleted-secret");
  expect(
    render("entity_read_comments", {
      coverage: "authorized_thread_replies",
      items: [],
      hasMore: false,
    }),
  ).toContain("selected thread");
});

it("renders a model round containing snapshot discovery and comparison without dropping either result", () => {
  const defs = ["entity_read_snapshots", "entity_compare_snapshots"].map(
    (name) => ({
      name,
      description: "Read",
      inputSchema: {},
      entitySection: { entityCode: "example", sectionKey: name, aliases: [] },
    }),
  );
  const results = [
    {
      type: "tool_result" as const,
      toolName: defs[0]!.name,
      callId: "list",
      result: {
        coverage: "authorized_snapshots_in_default_date_range",
        items: [],
        hasMore: false,
      },
    },
    {
      type: "tool_result" as const,
      toolName: defs[1]!.name,
      callId: "compare",
      result: {
        coverage: "currently_authorized_captured_root_fields",
        from: "old",
        to: "new",
        fields: [],
      },
    },
  ];
  const answer = entityContextAnswer(results, defs)!;
  expect(answer).toContain("Saved snapshots");
  expect(answer).toContain("Snapshot comparison");
  expect(
    entityContextAnswer([results[0]!, { ...results[1]!, isError: true }], defs),
  ).toBeUndefined();
});
