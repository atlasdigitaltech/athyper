import { describe, expect, it } from "vitest";
import { governanceErrorCodes, governancePermissions } from "./index.js";
describe("governance contract", () => { it("publishes stable codes", () => { expect(new Set(governanceErrorCodes).size).toBe(governanceErrorCodes.length); expect(governancePermissions.consentWrite).toBe("governance.consent.write"); }); });
