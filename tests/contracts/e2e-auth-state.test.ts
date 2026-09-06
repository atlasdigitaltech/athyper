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
