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

it("renders every requested value separately, preserving ambiguity and missing matches", () => {
  const answer = entityLookupAnswer([
    result({
      kind: "entity_lookup",
      entityCode: "example",
      summary: true,
      matches: [
        {
          value: "First",
          match: "one",
          items: [
            { recordId: "1", fields: [{ label: "Name", value: "First" }] },
          ],
        },
        {
          value: "Second",
          match: "ambiguous",
          items: [
            { recordId: "2", fields: [{ label: "Name", value: "Second" }] },
          ],
        },
        { value: "Missing", match: "no_authorized_match", items: [] },
      ],
    }),
  ]);
  expect(answer).toContain("Name: First");
  expect(answer).toContain("Name: Second");
  expect(answer).toContain("Which one do you mean?");
  expect(answer).toContain("Missing\nNo matching authorized record");
  expect(answer).toContain("up to eight permitted published fields");
});
