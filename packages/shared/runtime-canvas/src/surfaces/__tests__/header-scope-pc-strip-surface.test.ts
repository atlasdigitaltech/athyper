import { describe, expect, it } from "vitest";
import { shouldShowComponentsEmptyState } from "../header-scope-pc-strip-surface";

describe("header component empty-state projection", () => {
  it("does not hide line-derived components when no stored header component exists", () => {
    expect(shouldShowComponentsEmptyState(0, 1, "read_only")).toBe(false);
  });

  it("shows the read-only empty state only when both scopes are empty", () => {
    expect(shouldShowComponentsEmptyState(0, 0, "read_only")).toBe(true);
  });

  it("keeps the editable surface mounted when both scopes are empty", () => {
    expect(shouldShowComponentsEmptyState(0, 0, "edit")).toBe(false);
  });
});
