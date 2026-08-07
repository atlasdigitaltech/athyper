import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildRuntimeApiUrl,
  normalizeRuntimeApiUrl,
} from "./runtime-url.ts";

describe("runtime API URL construction", () => {
  it("normalizes plain, trailing-slash, and terminal-api origins", () => {
    assert.equal(normalizeRuntimeApiUrl("https://api.example.com"), "https://api.example.com");
    assert.equal(normalizeRuntimeApiUrl("https://api.example.com/"), "https://api.example.com");
    assert.equal(normalizeRuntimeApiUrl("https://api.example.com/api"), "https://api.example.com");
    assert.equal(normalizeRuntimeApiUrl("https://api.example.com/API///"), "https://api.example.com");
  });

  it("joins API paths without duplicating the mountpoint", () => {
    assert.equal(
      buildRuntimeApiUrl("https://api.example.com/api", "/api/finance/setup"),
      "https://api.example.com/api/finance/setup",
    );
  });

  it("preserves non-api runtime paths", () => {
    assert.equal(
      buildRuntimeApiUrl("https://api.example.com/api/", "/runtime/v1/entities/invoice"),
      "https://api.example.com/runtime/v1/entities/invoice",
    );
  });

  it("accepts a pathname without a leading slash", () => {
    assert.equal(
      buildRuntimeApiUrl("https://api.example.com/", "api/metadata/entities"),
      "https://api.example.com/api/metadata/entities",
    );
  });
});
