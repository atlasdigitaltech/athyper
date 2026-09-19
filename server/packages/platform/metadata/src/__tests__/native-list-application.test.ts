import { describe, expect, it } from "vitest";
import { projectListPresentation } from "../native-runtime-projection.js";

const baseline = {
  experience: {
    schemaVersion: 1,
    application: { key: "business_partner", defaultSectionKey: "overview" },
    currentSurfaceKey: "partners",
    header: { title: "Business Partners" },
    navigation: [
      {
        key: "overview",
        content: { kind: "overview" },
        permissions: [{ permissionCode: "bp.navigate_overview" }],
      },
      {
        key: "manage",
        content: { kind: "entity_list", entityCode: "business_partner" },
        scopes: [{ scopeKind: "tenant" }],
      },
    ],
    routes: [{ surfaceKey: "overview", href: "/mdg/business-partner" }],
    actions: [{ key: "create", permissionCode: "bp.create" }],
  },
};
const list = {
  title: "Draft title",
  defaultState: { columns: ["display_name"] },
  experience: {
    schemaVersion: 1,
    header: { title: "Draft title" },
    routes: [],
    actions: [],
  },
};

describe("list preview within a registered application", () => {
  it("retains section content, routes and authorization contracts while applying list edits", () => {
    const result = projectListPresentation(list, baseline);
    expect(result.title).toBe("Draft title");
    expect(result.defaultState.columns).toEqual(["display_name"]);
    expect(result.experience.header).toEqual(list.experience.header);
    for (const key of [
      "application",
      "navigation",
      "routes",
      "actions",
      "currentSurfaceKey",
    ])
      expect(result.experience[key]).toEqual(
        baseline.experience[key as keyof typeof baseline.experience],
      );
    expect(list.experience).not.toHaveProperty("application");
  });
  it("honors an explicitly authored replacement application, including empty navigation", () => {
    const replacement = {
      ...list,
      experience: {
        ...list.experience,
        application: { key: "replacement" },
        navigation: [],
      },
    };
    expect(projectListPresentation(replacement, baseline)).toBe(replacement);
  });
  it("does not invent application navigation for standalone lists", () => {
    expect(projectListPresentation(list)).toBe(list);
  });
});

import { projectNativeFieldChoices } from "../native-runtime-projection.js";
it("preserves declared country semantics and enum choices without copying policy fields", () => {
  expect(projectNativeFieldChoices({ semanticRole: "country_code", defaultVisible: false, writableOn: ["create"] }, "string"))
    .toEqual({ list: { semanticRole: "country_code" } });
  expect(projectNativeFieldChoices({ lookup: { options: [{ value: "active", label: "Active" }, { value: "draft", label: "Draft" }] } }, "enum"))
    .toEqual({ list: {}, validation: { options: ["active", "draft"] } });
  expect(projectNativeFieldChoices({}, "enum")).toEqual({ list: {} });
});
