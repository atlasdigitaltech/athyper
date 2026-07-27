import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const ADMIN_GLOBALS_URL = new URL("../globals.css", import.meta.url);
const ATLAS_STYLES_URL = new URL(
  import.meta.resolve("@athyper/atlas-agent-ui/styles.css"),
);
const ATLAS_PACKAGE_URL = new URL(
  import.meta.resolve("@athyper/atlas-agent-ui/package.json"),
);

describe("Admin Atlas style contract", () => {
  it("imports the shared Atlas stylesheet that owns trigger motion classes", async () => {
    const [adminGlobals, atlasStyles, atlasPackageSource] = await Promise.all([
      readFile(ADMIN_GLOBALS_URL, "utf8"),
      readFile(ATLAS_STYLES_URL, "utf8"),
      readFile(ATLAS_PACKAGE_URL, "utf8"),
    ]);
    const atlasPackage = JSON.parse(atlasPackageSource) as {
      exports?: Record<string, string>;
    };

    expect(adminGlobals).toContain('@import "@athyper/atlas-agent-ui/styles.css";');
    expect(atlasPackage.exports?.["./styles.css"]).toBe("./src/styles.css");
    expect(atlasStyles).toContain(".atlas-shimmer");
    expect(atlasStyles).toContain(".atlas-spark");
    expect(atlasStyles).toContain("@media (prefers-reduced-motion: reduce)");
    expect(adminGlobals).not.toContain("@keyframes atlas-shimmer");
    expect(adminGlobals).not.toContain("@keyframes atlas-spark");
  });
});
