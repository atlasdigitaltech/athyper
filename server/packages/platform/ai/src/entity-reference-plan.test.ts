import { expect, it } from "vitest";
import type {
  AtlasBusinessContextV1,
  AtlasModelPrompt,
} from "@athyper/server-contract-ai";
import { directDiscoveredReferenceRead as plan } from "./entity-reference-plan.js";
const page = {
  kind: "record",
  entityCode: "branch",
  recordId: "10000000-0000-4000-8000-000000000003",
  section: "overview",
  dirty: false,
  locale: "en",
  schemaVersion: 1,
  generationId: "10000000-0000-4000-8000-000000000004",
} as AtlasBusinessContextV1;
function evidence(ambiguous = false): AtlasModelPrompt["messages"] {
  return [
    { role: "user", content: [{ type: "text", text: "Question" }] },
    {
      role: "tool",
      content: [
        {
          type: "tool_result",
          callId: "d",
          toolName: "entity_discover",
          result: {
            items: [
              {
                entityCode: "branch",
                fields: [],
                relationships: [
                  {
                    key: "home_zone",
                    label: "Home zone",
                    targetEntityCode: "zone",
                  },
                  ...(ambiguous
                    ? [
                        {
                          key: "billing_zone",
                          label: "Billing zone",
                          targetEntityCode: "zone",
                        },
                      ]
                    : []),
                ],
              },
              {
                entityCode: "zone",
                fields: [
                  { key: "code", label: "Code" },
                  { key: "dial_code", label: "Calling code" },
                  { key: "name", label: "Name" },
                ],
              },
            ],
          },
        },
      ],
    },
  ];
}
it("resolves only declared relative metadata and the explicit target field", () =>
  expect(
    plan("What is this branch zone calling code?", page, evidence()),
  ).toEqual({ relationshipKey: "home_zone", fields: ["dial_code"] }));
it.each([
  "What is Example zone calling code?",
  "Update this zone calling code",
  "What is this zone unknown field?",
  "What is this zone calling code or name?",
  "What is this branch zone calling code compared to France?",
  "What is this branch France zone calling code?",
])("leaves unsupported or nonrelative question to planning: %s", (text) =>
  expect(plan(text, page, evidence())).toBeUndefined(),
);
it("does not choose between ambiguous relationships", () =>
  expect(
    plan("What is this zone calling code?", page, evidence(true)),
  ).toBeUndefined());
it("does not borrow discovery from a previous turn", () =>
  expect(
    plan("What is this zone calling code?", page, [
      ...evidence(),
      { role: "user", content: [{ type: "text", text: "new question" }] },
    ]),
  ).toBeUndefined());
it("never turns a historical page into a current relation read", () =>
  expect(
    plan(
      "What is this zone calling code?",
      { ...page, asOf: {} } as never,
      evidence(),
    ),
  ).toBeUndefined());
