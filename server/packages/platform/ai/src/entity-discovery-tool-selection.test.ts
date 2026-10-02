import { expect, it } from "vitest";
import { entityDiscoveryRoundTools } from "./entity-discovery-tool-selection.js";
import type {
  AtlasModelPrompt,
  AtlasProviderToolDefinition,
} from "@athyper/server-contract-ai";
const tools = [
  "entity_discover",
  "entity_lookup",
  "entity_follow_reference",
].map((name) => ({
  name,
  description: name,
  inputSchema: {
    type: "object",
    properties: {
      entityCode: { type: "string" },
      value: { type: "string" },
      descriptorHash: { type: "string" },
    },
    required: ["entityCode", "value", "descriptorHash"],
  },
})) as AtlasProviderToolDefinition[];
const messages: AtlasModelPrompt["messages"] = [
  { role: "user", content: [{ type: "text", text: "Named record question" }] },
  {
    role: "tool",
    content: [
      {
        type: "tool_result",
        toolName: "entity_discover",
        callId: "d",
        result: { items: [{ entityCode: "nation" }] },
      },
    ],
  },
];
it("offers named lookup without the unrelated traversal schema", () =>
  expect(
    entityDiscoveryRoundTools(
      tools,
      "What is Example's calling code?",
      undefined,
      messages,
    ).map((tool) => tool.name),
  ).toEqual(["entity_lookup"]));
it("does not offer traversal without a published source relationship", () =>
  expect(
    entityDiscoveryRoundTools(
      tools,
      "What is this record's country?",
      undefined,
      messages,
    ).map((tool) => tool.name),
  ).toEqual(["entity_lookup"]));
it("offers the relative traversal alone when source metadata declares the relationship", () => {
  const scope = {
    kind: "record",
    entityCode: "region",
    recordId: "10000000-0000-4000-8000-000000000003",
    section: "overview",
    dirty: false,
    locale: "en",
    schemaVersion: 1,
    generationId: "10000000-0000-4000-8000-000000000004",
  } as const;
  const evidence: AtlasModelPrompt["messages"] = [
    messages[0]!,
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
                entityCode: "region",
                relationships: [
                  {
                    key: "country_code",
                    label: "Country",
                    targetEntityCode: "nation",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  ];
  expect(
    entityDiscoveryRoundTools(
      tools,
      "What is this region country calling code?",
      scope,
      evidence,
    ).map((tool) => tool.name),
  ).toEqual(["entity_follow_reference"]);
});

it("compacts redundant planning labels without changing authorized server evidence",async()=>{
 const {entityDiscoveryPromptMessages}=await import("./entity-discovery-tool-selection.js");
 const original:AtlasModelPrompt["messages"]=[{role:"tool",content:[{type:"tool_result",toolName:"entity_discover",callId:"d",result:{kind:"entity_catalogue",coverage:"partial",items:[{entityCode:"reference",descriptorHash:"pinned",capabilities:["entity_lookup"],relationships:[],fields:[{key:"name",label:"Name",searchable:true},{key:"dial_code",label:"Calling code",searchable:false}]}]}}]}];
 const projected=entityDiscoveryPromptMessages(original);
 expect(JSON.stringify(projected)).not.toContain("pinned");
 expect(JSON.stringify(projected)).toContain("Calling code");
 expect(JSON.stringify(projected)).toContain('"coverage":"partial"');
 expect(JSON.stringify(projected)).not.toContain('"label":"Name"');
 expect(JSON.stringify(original)).toContain('"label":"Name"');
 expect(JSON.stringify(original)).toContain("pinned");
});
