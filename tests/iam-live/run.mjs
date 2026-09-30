import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const composeFile = fileURLToPath(new URL("./compose.yml", import.meta.url));

try {
  run(["compose", "-f", composeFile, "up", "--wait"]);
  run(["compose", "-f", composeFile, "ps"]);
} finally {
  run(
    ["compose", "-f", composeFile, "down", "--volumes", "--remove-orphans"],
    false,
  );
}

function run(args, required = true) {
  const result = spawnSync("docker", args, { stdio: "inherit" });
  if (result.error && required) throw result.error;
  if (required && result.status !== 0) {
    throw new Error(
      `docker ${args.join(" ")} failed with exit code ${result.status ?? "unknown"}`,
    );
  }
}
