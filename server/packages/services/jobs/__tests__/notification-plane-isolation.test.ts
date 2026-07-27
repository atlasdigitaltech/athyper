import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("notification plane isolation guards", () => {
  it("passes the typed message plane into the push subscription lookup", () => {
    const worker = source("../workers/notification.worker.ts");
    const push = source("../adapters/push.adapter.ts");

    expect(worker).toContain('planeKey:      "neon" | "mesh" | "admin"');
    expect(worker).toContain("planeKey:      msg.plane_key");
    expect(push).toContain("AND  plane_key    = ${planeKey}");
  });

  it("makes every direct notification-message writer explicit", () => {
    const writers = [
      "../handlers/wf-outbox.handler.ts",
      "../handlers/p2p-notification-outbox.handler.ts",
      "../workers/lifecycle-timer.worker.ts",
      "../workers/notification.worker.ts",
      "../../platform/notification-orchestrator.ts",
      "../../platform/routes/notification.route.ts",
      "../../business/lifecycle/notification-dispatch.service.ts",
    ];

    for (const writer of writers) {
      const contents = source(writer);
      const inserts = contents.split("INSERT INTO event.notification_message").slice(1);
      expect(inserts.length, writer).toBeGreaterThan(0);
      for (const insert of inserts) {
        expect(insert.slice(0, 300), writer).toContain("plane_key");
      }
    }
  });
});
