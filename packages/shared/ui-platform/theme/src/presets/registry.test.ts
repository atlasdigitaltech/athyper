import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET,
  getPresetMeta,
  themePresets,
} from "./registry";

describe("theme preset migration", () => {
  it("uses a neutral canonical baseline while resolving legacy values", () => {
    expect(DEFAULT_PRESET).toBe("athyper-base");
    expect(getPresetMeta("athyper-base")?.value).toBe("athyper-base");
    expect(getPresetMeta("base")?.value).toBe("athyper-base");
    expect(getPresetMeta("neon-base")?.value).toBe("athyper-base");
    expect(themePresets.some((preset) => preset.value === "neon-base")).toBe(false);
  });

  it("ships one aggregate stylesheet with stable chrome after every preset", () => {
    const css = readFileSync(new URL("../all.css", import.meta.url), "utf8");
    expect(css).toContain('./presets/athyper-base.css');
    expect(css).toContain('./stable-chrome.css');
    expect(css.indexOf('./stable-chrome.css')).toBeGreaterThan(
      css.indexOf('./presets/atlas-vintage.css'),
    );
  });

  it("keeps unsafe utility-selector border fallbacks out of stable chrome", () => {
    const css = readFileSync(
      new URL("../stable-chrome.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toContain(":where(.border");
    expect(css).not.toContain(":where(.divide");
    expect(css).toContain("--radius: var(--athyper-radius-md, 0.625rem)");
  });
});
