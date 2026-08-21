import { describe, expectTypeOf, it } from "vitest";
import type { PolicyDecision, PolicyRepository, PolicyService } from "../index.js";
describe("policy contract API", () => { it("separates evaluation and persistence", () => { expectTypeOf<PolicyService<symbol>>().toHaveProperty("evaluate"); expectTypeOf<PolicyRepository<symbol>>().toHaveProperty("findActive"); expectTypeOf<PolicyDecision["action"]>().toEqualTypeOf<"allow"|"deny"|"warn"|"require_workflow"|"escalate"|"none">(); }); });
