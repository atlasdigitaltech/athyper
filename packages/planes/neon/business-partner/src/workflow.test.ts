import { describe, expect, it } from "vitest";
import { statusTone } from "./workflow";

describe("Business Partner status presentation", () => {
  it("keeps status tone presentational rather than recomputing command authority", () => {
    expect(statusTone("draft")).toBe("neutral");
    expect(statusTone("pending_approval")).toBe("warning");
    expect(statusTone("approved")).toBe("success");
    expect(statusTone("failed")).toBe("danger");
  });
});
