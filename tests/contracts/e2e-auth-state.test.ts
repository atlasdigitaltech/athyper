import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { storageStateHasAuthenticatedSession } from "../e2e/auth-state";

describe("Playwright authenticated storage-state gate", () => {
  it("rejects empty, malformed, and non-session state while accepting either session cookie", () => {
    const directory = mkdtempSync(join(tmpdir(), "athyper-auth-state-"));
    const path = join(directory, "state.json");
    try {
      for (const value of [
        "",
        "not-json",
        JSON.stringify({ cookies: [], origins: [] }),
        JSON.stringify({ cookies: [{ name: "athyper-csrf", value: "token" }] }),
      ]) {
        writeFileSync(path, value);
        assert.equal(storageStateHasAuthenticatedSession(path), false);
      }
      for (const name of ["athyper-session", "__Host-athyper-session"]) {
        writeFileSync(
          path,
          JSON.stringify({
            cookies: [
              {
                name,
                value: "opaque-session",
                domain: "neon.example.test",
                expires: -1,
              },
            ],
          }),
        );
        assert.equal(
          storageStateHasAuthenticatedSession(
            path,
            "https://neon.example.test",
          ),
          true,
        );
        assert.equal(
          storageStateHasAuthenticatedSession(
            path,
            "https://mesh.example.test",
          ),
          false,
        );
      }
      writeFileSync(
        path,
        JSON.stringify({
          cookies: [
            {
              name: "athyper-session",
              value: "expired",
              domain: "neon.example.test",
              expires: 1,
            },
          ],
        }),
      );
      assert.equal(
        storageStateHasAuthenticatedSession(path, "https://neon.example.test"),
        false,
      );
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe("authenticated Neon review preflight", () => {
  it("fails instead of skipping when credentials are missing and never includes secret values", async () => {
    const { default: preflight } = await import("../e2e/neon-review/preflight");
    const names = ["PLAYWRIGHT_NEON_USER", "PLAYWRIGHT_NEON_PASSWORD"];
    const original = names.map(name => process.env[name]);
    try {
      for (const name of names) delete process.env[name];
      assert.throws(preflight, /Configure PLAYWRIGHT_NEON_USER, PLAYWRIGHT_NEON_PASSWORD/);
      process.env.PLAYWRIGHT_NEON_PASSWORD = "test-secret-must-not-be-printed";
      assert.throws(preflight, error => error instanceof Error && error.message.includes("PLAYWRIGHT_NEON_USER") && !error.message.includes("test-secret"));
      process.env.PLAYWRIGHT_NEON_USER = "test-user";
      assert.doesNotThrow(preflight);
    } finally {
      names.forEach((name, index) => {
        if (original[index] === undefined) delete process.env[name];
        else process.env[name] = original[index];
      });
    }
  });
});

describe("Playwright session file paths", () => {
  it("uses absolute paths so repository-root invocations can load saved sessions", async () => {
    const { isAbsolute, resolve } = await import("node:path");
    const { default: config } = await import("../../tooling/config/playwright.config");
    assert.equal(isAbsolute(config.use!.storageState as string), true);
    for (const plane of ["studio", "neon", "mesh"]) {
      for (const device of ["desktop", "mobile"]) {
        const project = config.projects!.find(item => item.name === `production-${plane}-${device}`)!;
        assert.equal(project.use!.storageState, resolve(`tests/e2e/.auth/${plane}.json`));
      }
    }
  });
});

describe("explicit MFA session reuse", () => {
  it("checks the saved session with the BFF and rejects expired or wrong-plane sessions", async () => {
    const { mock } = await import("node:test");
    const { request } = await import("@playwright/test");
    const { default: setup } = await import("../e2e/global-setup");
    const previous = process.env.PLAYWRIGHT_REUSE_AUTH_STATE;
    let session: Record<string, unknown> = { state: "authenticated", plane: "studio", tenantId: "tenant-test" };
    let disposed = 0;
    const mocked = mock.method(request, "newContext", async () => ({
      get: async (path: string) => {
        assert.equal(path, "/api/auth/session");
        return { ok: () => true, json: async () => session };
      },
      dispose: async () => { disposed++; },
    }));
    const config = { projects: [{ name: "production-studio-desktop", use: { baseURL: "https://studio.example.test" } }] } as any;
    try {
      process.env.PLAYWRIGHT_REUSE_AUTH_STATE = "studio";
      await setup(config);
      for (const value of [{ state: "anonymous" }, { state: "context_required", plane: "studio" }, { state: "authenticated", plane: "mesh", tenantId: "tenant-test" }]) {
        session = value;
        await assert.rejects(setup(config), /not authenticated/);
      }
      assert.equal(disposed, 4);
      process.env.PLAYWRIGHT_REUSE_AUTH_STATE = "invalid";
      await assert.rejects(setup(config), /must be studio, neon, or mesh/);
    } finally {
      mocked.mock.restore();
      if (previous === undefined) delete process.env.PLAYWRIGHT_REUSE_AUTH_STATE;
      else process.env.PLAYWRIGHT_REUSE_AUTH_STATE = previous;
    }
  });
});
