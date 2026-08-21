import { describe, expect, it } from "vitest";

import { resolveEntityQueryRuntimeConfig } from "../entity-query-runtime-config.js";

const DEDICATED_SECRET = "d".repeat(48);
const LEGACY_SECRET = "l".repeat(48);

describe("entity query runtime configuration", () => {
  it("uses and trims a strong dedicated cursor secret", () => {
    expect(resolveEntityQueryRuntimeConfig({
      ENTITY_QUERY_CURSOR_SECRET: `  ${DEDICATED_SECRET}  `,
      EXPORT_TOKEN_SECRET: LEGACY_SECRET,
    })).toEqual({
      enabled: true,
      cursorSecret: DEDICATED_SECRET,
      cursorSecretSource: "entity_query_cursor_secret",
      cursorSecretBytes: 48,
    });
  });

  it("allows a blank dedicated value to fall back to a strong legacy secret", () => {
    expect(resolveEntityQueryRuntimeConfig({
      ENTITY_QUERY_CURSOR_SECRET: "   ",
      EXPORT_TOKEN_SECRET: LEGACY_SECRET,
    })).toMatchObject({
      enabled: true,
      cursorSecret: LEGACY_SECRET,
      cursorSecretSource: "export_token_secret",
    });
  });

  it("rejects a non-blank weak dedicated secret instead of hiding the error", () => {
    expect(resolveEntityQueryRuntimeConfig({
      ENTITY_QUERY_CURSOR_SECRET: "too-short",
      EXPORT_TOKEN_SECRET: LEGACY_SECRET,
    })).toEqual({
      enabled: false,
      cursorSecretSource: "entity_query_cursor_secret",
      cursorSecretBytes: 9,
      disabledReason: "cursor_secret_too_short",
    });
  });

  it("reports a missing secret when both sources are blank", () => {
    expect(resolveEntityQueryRuntimeConfig({
      ENTITY_QUERY_CURSOR_SECRET: "",
      EXPORT_TOKEN_SECRET: " ",
    })).toEqual({
      enabled: false,
      cursorSecretBytes: 0,
      disabledReason: "missing_cursor_secret",
    });
  });
});
