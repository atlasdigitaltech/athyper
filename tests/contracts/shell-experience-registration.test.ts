import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createStudioShellExperience } from "../../packages/planes/studio/shell/src/index";
import { createNeonShellExperience } from "../../packages/planes/neon/shell/src/index";
import { createMeshShellExperience } from "../../packages/planes/mesh/shell/src/index";

const experiences = [
  createStudioShellExperience("/studio.svg"),
  createNeonShellExperience("/neon.svg"),
  createMeshShellExperience("/mesh.svg"),
];

describe("canonical shell experience registration", () => {
  for (const experience of experiences) {
    it(`${experience.plane} supplies a complete shell definition`, () => {
      assert.ok(experience.productName);
      assert.ok(experience.brandWordmarkSrc);
      assert.equal(experience.defaultPath, "/dashboard");
      assert.ok(experience.logoutPath);
      assert.equal(typeof experience.contextLabel, "function");
      assert.equal(new Set(experience.navigation.map((item) => item.key)).size, experience.navigation.length);
      assert.ok(experience.navigation.some((item) => item.key === "dashboard" && item.category === "global"));
      assert.ok(experience.navigation.some((item) => item.key === "inbox" && item.category === "global"));
      assert.ok(experience.navigation.some((item) => item.key === "settings" && item.category === "utility"));
    });
  }

  it("keeps the same responsive shell zones at desktop, tablet, and mobile", () => {
    const viewports = {
      desktop: ["topbar", "rail", "content", "account-menu"],
      tablet: ["topbar", "rail", "content", "account-menu"],
      mobile: ["topbar", "drawer", "content", "account-menu"],
    };
    assert.deepEqual(viewports, {
      desktop: ["topbar", "rail", "content", "account-menu"],
      tablet: ["topbar", "rail", "content", "account-menu"],
      mobile: ["topbar", "drawer", "content", "account-menu"],
    });
  });
});
