import { describe, expect, it } from "vitest";
import { controlAdminErrorCodes } from "./index.js";
describe("control-admin contract", () => { it("has unique stable errors", () => expect(new Set(controlAdminErrorCodes).size).toBe(controlAdminErrorCodes.length)); });
