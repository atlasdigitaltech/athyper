import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// tsx watch stays alive after its application exits. Propagate fatal boot errors
// so Docker's restart policy can recover without requiring a source-file edit.
export function watchRuntime(command, args, options = {}) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["inherit", "pipe", "pipe"],
  });
  let failed = false,
    stopping = false,
    timer;
  const stop = (signal = "SIGTERM") => {
    stopping = true;
    child.kill(signal);
    timer ??= setTimeout(() => child.kill("SIGKILL"), 10000);
    timer.unref();
  };
  for (const [stream, destination] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    let tail = "";
    stream.on("data", (data) => {
      destination.write(data);
      tail = (tail + data.toString()).slice(-16384);
      if (!stopping && tail.includes("[fatal] boot_failed")) {
        failed = true;
        stop();
      }
    });
  }
  const signals = ["SIGTERM", "SIGINT"];
  const handlers = signals.map((signal) => {
    const handler = () => stop(signal);
    process.once(signal, handler);
    return handler;
  });
  return new Promise((resolve) => {
    child.once("error", () => {
      failed = true;
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      signals.forEach((signal, index) => process.off(signal, handlers[index]));
      resolve(failed ? 1 : stopping ? 0 : (code ?? 1));
    });
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.exitCode = await watchRuntime(process.execPath, [
    "node_modules/tsx/dist/cli.mjs",
    "watch",
    "--tsconfig",
    "server/apps/platform-host/tsconfig.json",
    "server/apps/platform-host/src/main.ts",
  ]);
}
