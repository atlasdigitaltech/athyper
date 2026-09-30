import { describe, expect, it } from "vitest";
import { readLocalGraphProjections } from "./local-graph-preview.js";

describe("readLocalGraphProjections", () => {
  it("is disabled unless a preview root is configured", () => {
    expect(readLocalGraphProjections("t", "studio", undefined, {})).toEqual([]);
  });

  it("refuses to run outside the personal local workspace", () => {
    expect(() =>
      readLocalGraphProjections("t", "studio", undefined, { ATHYPER_LOCAL_PREVIEW_ROOT: "/x" }),
    ).toThrow("GRAPH_PREVIEW_LOCAL_WORKSPACE_REQUIRED");
  });
});
