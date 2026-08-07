import { afterEach, describe, expect, it } from "vitest";
import { readCsrfToken } from "./csrf";

const originalCookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");

afterEach(() => {
  if (originalCookieDescriptor) {
    Object.defineProperty(document, "cookie", originalCookieDescriptor);
  }
});

function setCookieHeader(value: string): void {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    value,
  });
}

describe("identity-gate CSRF cookie lookup", () => {
  it("reads the local base cookie name", () => {
    setCookieHeader("__mesh_csrf=local-token");
    expect(readCsrfToken("mesh")).toBe("local-token");
  });

  it("reads the hardened production cookie name", () => {
    setCookieHeader("__Host-__admin_csrf=production-token");
    expect(readCsrfToken("admin")).toBe("production-token");
  });

  it("prefers the hardened cookie when both names are present", () => {
    setCookieHeader("__csrf=legacy-token; __Host-__csrf=hardened-token");
    expect(readCsrfToken("neon")).toBe("hardened-token");
  });
});
