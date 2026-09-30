import test from "node:test";
import assert from "node:assert/strict";
import { watchRuntime } from "./watch-runtime.mjs";

test(
  "fatal boot exits a watcher that would otherwise stay alive",
  { timeout: 15000 },
  async () => {
    const result = await watchRuntime(process.execPath, [
      "-e",
      "console.error('[fatal] boot_failed Redis unavailable');setInterval(()=>{},1000)",
    ]);
    assert.equal(result, 1);
  },
);
test("a new watcher starts successfully after the dependency recovers", async () => {
  assert.equal(
    await watchRuntime(process.execPath, ["-e", "process.exit(0)"]),
    0,
  );
});
