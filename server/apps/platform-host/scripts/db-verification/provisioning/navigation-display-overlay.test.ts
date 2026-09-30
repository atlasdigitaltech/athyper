import { expect, it } from "vitest";
import { navigationDisplayOverlay } from "./navigation-display-overlay.js";
it("changes only declared display modes and preserves live navigation and permissions", () => {
  const artifactKey = "business_partner/presentation.detail";
  const baseline = [{artifactKey, navigation: {tabs: [{key: "custom", provider: "section", sectionKeys: ["a", "b"], label: "Keep"}]}, sections: [{viewPermission: "keep"}]}];
  const source = {artifactKey, navigation: {tabs: [{key: "custom", sectionDisplay: "continuous", sectionKeys: ["unpublished"], label: "Wrong"}]}};
  expect(navigationDisplayOverlay(baseline, [source])).toEqual([{...baseline[0], navigation: {tabs: [{...baseline[0].navigation.tabs[0], sectionDisplay: "continuous"}]}}]);
  expect(baseline[0].navigation.tabs[0]).not.toHaveProperty("sectionDisplay");
  expect(() => navigationDisplayOverlay(baseline, [{...source, navigation: {tabs: [{key: "custom", sectionDisplay: "invalid"}]}}])).toThrow("INVALID");
  expect(() => navigationDisplayOverlay(baseline, [{...source, navigation: {tabs: [{key: "missing", sectionDisplay: "continuous"}]}}])).toThrow("TAB_MISSING");
});
