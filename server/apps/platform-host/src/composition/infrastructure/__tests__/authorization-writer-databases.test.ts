import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vitest";
import { createAuthorizationWriterDatabases } from "../authorization-writer-databases.js";
it.each([
  "postgres://writer:secret@localhost/athyper_neon",
  "postgres://postgres:secret@localhost/athyper_studio",
  "https://writer:secret@localhost/athyper_studio",
])(
  "rejects wrong plane, superuser coordinates and unsupported protocols without exposing credentials",
  (connection) => {
    const dir = mkdtempSync(join(tmpdir(), "atlas-writer-"));
    try {
      const path = join(dir, "connections.json");
      writeFileSync(
        path,
        JSON.stringify({
          schemaVersion: 1,
          connections: { studio: connection },
        }),
      );
      expect(() => createAuthorizationWriterDatabases(path)).toThrow(
        "AUTHZ_WRITER_CONNECTIONS_INVALID",
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
it("redacts malformed secret configuration", () => {
  const dir = mkdtempSync(join(tmpdir(), "atlas-writer-"));
  try {
    const path = join(dir, "connections.json");
    writeFileSync(path, '{"password":"secret",BROKEN');
    expect(() => createAuthorizationWriterDatabases(path)).toThrow(
      /^AUTHZ_WRITER_CONNECTIONS_INVALID$/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
