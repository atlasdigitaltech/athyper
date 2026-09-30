import { expect, it } from "vitest";
import {
  entityDiscoveryRoundTools,
  bindDiscoveredEntityLookup,
  entityDiscoveryPromptMessages,
} from "./entity-discovery-tool-selection.js";
const tools = [
  "entity_discover",
  "entity_lookup",
  "entity_follow_reference",
  "unrelated",
].map((name) => ({ name, description: name, inputSchema: {} }));
it("stages discovery before data reads and ignores discovery from earlier conversation turns", () => {
  const discovery = {
    role: "tool" as const,
    content: [
      {
        type: "tool_result" as const,
        callId: "d",
        toolName: "entity_discover",
        result: { items: [{ entityCode: "example" }] },
      },
    ],
  };
  const user = {
    role: "user" as const,
    content: [{ type: "text" as const, text: "question" }],
  };
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [user]).map(
      (t) => t.name,
    ),
  ).toEqual(["entity_discover"]);
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [
      user,
      discovery,
    ]).map((t) => t.name),
  ).toEqual(["entity_lookup", "entity_follow_reference"]);
  expect(
    entityDiscoveryRoundTools(tools, "question", undefined, [
      user,
      discovery,
      user,
    ]).map((t) => t.name),
  ).toEqual(["entity_discover"]);
});

it("does not expose current-record summaries for explicitly named records or code questions", () => {
  const withSummary = [
    ...tools,
    {
      name: "entity_read_record",
      description: "Summary",
      inputSchema: {},
      entitySection: {
        entityCode: "nation",
        sectionKey: "record_summary",
        aliases: ["summary", "nation"],
        resultKey: "items",
        label: "Summary",
      },
    },
  ];
  const messages = [
    {
      role: "user" as const,
      content: [{ type: "text" as const, text: "question" }],
    },
    {
      role: "tool" as const,
      content: [
        {
          type: "tool_result" as const,
          callId: "d",
          toolName: "entity_discover",
          result: { items: [{ entityCode: "nation" }] },
        },
      ],
    },
  ];
  for (const question of [
    "Show record summary of First and Second",
    "Official name of Nation Code AB",
  ])
    expect(
      entityDiscoveryRoundTools(withSummary, question, undefined, messages).map(
        (t) => t.name,
      ),
    ).toEqual(["entity_lookup", "entity_follow_reference"]);
});

it("pins only current-turn discovery and rejects forged, undiscovered or conflicting coordinates", () => {
  const user = {
    role: "user" as const,
    content: [{ type: "text" as const, text: "question" }],
  };
  const discovery = {
    role: "tool" as const,
    content: [
      {
        type: "tool_result" as const,
        callId: "d",
        toolName: "entity_discover",
        result: {
          items: [{ entityCode: "example", descriptorHash: "published" }],
        },
      },
    ],
  };
  expect(
    bindDiscoveredEntityLookup(
      {
        entityCode: "example",
        values: ["A", "B"],
        projection: "summary",
        fields: ["name"],
      },
      [user, discovery],
    ),
  ).toEqual({
    entityCode: "example",
    value: ["A", "B"],
    fields: [],
    descriptorHash: "published",
  });
  expect(
    bindDiscoveredEntityLookup(
      {
        entityCode: "example",
        values: ["A"],
        projection: "fields",
        fields: ["name"],
      },
      [user, discovery],
    ),
  ).toMatchObject({ fields: ["name"] });
  expect(() =>
    bindDiscoveredEntityLookup(
      { entityCode: "example", projection: "unknown" },
      [user, discovery],
    ),
  ).toThrow();
  expect(
    bindDiscoveredEntityLookup(
      { entityCode: "example", values: ["A", "B"], fields: [] },
      [user, discovery],
    ),
  ).toEqual({
    entityCode: "example",
    value: ["A", "B"],
    fields: [],
    descriptorHash: "published",
  });
  expect(
    bindDiscoveredEntityLookup({ entityCode: "example", value: "A" }, [
      user,
      discovery,
    ]),
  ).toMatchObject({ descriptorHash: "published" });
  for (const [input, messages] of [
    [{ entityCode: "other" }, [user, discovery]],
    [{ entityCode: "example", descriptorHash: "forged" }, [user, discovery]],
    [{ entityCode: "example", values: ["A"], value: "B" }, [user, discovery]],
    [{ entityCode: "example" }, [user, discovery, user]],
    [
      { entityCode: "example" },
      [
        user,
        {
          ...discovery,
          content: [{ ...discovery.content[0]!, isError: true }],
        },
      ],
    ],
  ] as const)
    expect(() => bindDiscoveredEntityLookup(input, messages)).toThrow();
});

it("omits server publication pins from model planning without modifying evidence", () => {
  const messages = [
    {
      role: "tool" as const,
      content: [
        {
          type: "tool_result" as const,
          callId: "d",
          toolName: "entity_discover",
          result: {
            items: [
              {
                entityCode: "example",
                descriptorHash: "published",
                fields: [{ key: "name", label: "Name" }],
              },
            ],
          },
        },
      ],
    },
  ];
  const visible = entityDiscoveryPromptMessages(messages);
  expect(JSON.stringify(visible)).not.toContain("descriptorHash");
  expect(JSON.stringify(visible)).toContain('"label":"Name"');
  expect(messages[0]!.content[0]!.result.items[0]!.descriptorHash).toBe(
    "published",
  );
});
