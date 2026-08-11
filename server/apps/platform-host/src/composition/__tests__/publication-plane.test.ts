import { describe, expect, it } from "vitest";

import { publicationPlaneToHostPlane } from "../publication-plane.js";

describe("Publication plane host composition", () => {
  it.each([
    ["studio", "studio"],
    ["neon", "neon"],
    ["mesh", "mesh"],
  ] as const)("maps canonical %s to the existing %s adapter key", (publicationPlane, hostPlane) => {
    expect(publicationPlaneToHostPlane(publicationPlane)).toBe(hostPlane);
  });
});
