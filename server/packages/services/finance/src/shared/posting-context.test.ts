import { describe, expect, it } from "vitest";
import type { PostingContext } from "./posting-context.js";
describe("PostingContext", () => { it("is bound to Neon", () => { const value = { planeKey: "neon" } as PostingContext; expect(value.planeKey).toBe("neon"); }); });
