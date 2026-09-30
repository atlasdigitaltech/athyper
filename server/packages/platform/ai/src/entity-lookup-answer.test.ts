import { expect, it } from "vitest";
import { entityLookupAnswer } from "./entity-lookup-answer.js";
const result = (data: unknown) => ({
  type: "tool_result" as const,
  toolName: "entity_lookup",
  callId: "call",
  result: data,
});
it("renders published labels and authorized values without generating extra facts", () => {
  const answer = entityLookupAnswer([
    result({
      kind: "entity_lookup",
      entityCode: "nation",
      match: "one",
      items: [
        {
          recordId: "record",
          fields: [{ key: "dial", label: "Calling code", value: "999" }],
        },
      ],
    }),
  ]);
  expect(answer).toContain("Calling code: 999");
  expect(answer).not.toContain("dial:");
});
it("preserves ambiguity and absence limits instead of claiming a unique match or nonexistence", () => {
  expect(
    entityLookupAnswer([
      result({
        kind: "entity_lookup",
        entityCode: "nation",
        match: "ambiguous",
        items: [
          { recordId: "one", fields: [] },
          { recordId: "two", fields: [] },
        ],
      }),
    ]),
  ).toContain("Which one do you mean");
  expect(
    entityLookupAnswer([
      result({
        kind: "entity_lookup",
        match: "no_authorized_match",
        items: [],
      }),
    ]),
  ).toContain("does not establish");
});
it("never finalizes metadata discovery, failed reads or mixed results as a record answer", () => {
  expect(
    entityLookupAnswer([
      { ...result({ items: [] }), toolName: "entity_discover" },
    ]),
  ).toBeUndefined();
  expect(
    entityLookupAnswer([{ ...result({ items: [] }), isError: true }]),
  ).toBeUndefined();
});
