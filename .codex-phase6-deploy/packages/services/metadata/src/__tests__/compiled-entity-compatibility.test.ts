import { describe, expect, it } from "vitest";
import { CompiledEntitySchema } from "@athyper/api-contracts/metadata";

describe("compiled entity compatibility projection", () => {
  it("accepts a null subtitle field emitted by the v2-to-legacy adapter", () => {
    const displayConfig = CompiledEntitySchema.shape.display_config;

    expect(displayConfig.safeParse({
      title_field: "id",
      subtitle_field: null,
    }).success).toBe(true);
  });
});
