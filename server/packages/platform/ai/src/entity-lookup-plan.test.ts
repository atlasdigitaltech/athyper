import { expect, it } from "vitest";
import type { AtlasModelPrompt } from "@athyper/server-contract-ai";
import { directDiscoveredCodeLookup as plan } from "./entity-lookup-plan.js";
const messages: AtlasModelPrompt["messages"] = [
  { role: "user", content: [{ type: "text", text: "question" }] },
  {
    role: "tool",
    content: [
      {
        type: "tool_result",
        toolName: "entity_discover",
        callId: "d",
        result: {
          items: [
            {
              entityCode: "shipping_zone",
              fields: [{ key: "zone_key", label: "Code", searchable: true }],
            },
          ],
        },
      },
    ],
  },
];
it("resolves a generic metadata code field, preserving its requested value", () =>
  expect(
    plan("Show record summary of shipping zone code Ab-12", messages),
  ).toEqual({
    entityCode: "shipping_zone",
    searchField: "zone_key",
    values: ["Ab-12"],
    projection: "summary",
  }));
it.each([
  "Show record summary of unknown code Ab-12",
  "Show record summary of shipping zone code Ab-12 and C",
  "Update shipping zone code Ab-12",
  "Show record summary of current shipping zone code Ab-12",
])("declines unsupported or ambiguous input: %s", (text) =>
  expect(plan(text, messages)).toBeUndefined(),
);
it("rejects prior-turn metadata and undiscovered searchable fields", () => {
  expect(
    plan("Show record summary of shipping zone code Ab-12", [
      ...messages,
      { role: "user", content: [{ type: "text", text: "next" }] },
    ]),
  ).toBeUndefined();
  expect(
    plan(
      "Show record summary of shipping zone code Ab-12",
      JSON.parse(
        JSON.stringify(messages).replace(
          '"searchable":true',
          '"searchable":false',
        ),
      ),
    ),
  ).toBeUndefined();
});
