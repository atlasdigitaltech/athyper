#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { assertRenderedBindings } from "../../stackctl/src/rendered-bindings.mjs";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
if (separator < 0 || args[separator + 1] !== "up") {
  console.error(
    "Usage: node safe-compose.mjs [Compose global options] -- up [options/services]",
  );
  process.exit(1);
}
const prefix = ["compose", ...args.slice(0, separator)];
const rendered = spawnSync(
  "docker",
  [...prefix, "config", "--format", "json"],
  { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
);
if (rendered.status !== 0) {
  console.error("Compose rendering failed; no containers started.");
  process.exit(1);
}
try {
  assertRenderedBindings(JSON.parse(rendered.stdout));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const result = spawnSync("docker", [...prefix, ...args.slice(separator + 1)], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
