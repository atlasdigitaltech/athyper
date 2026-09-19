import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Consume Docker Compose's normalized JSON after all env/override interpolation.
export function assertRenderedBindings(config) {
  if (!config?.services || typeof config.services !== "object")
    throw new Error("Rendered Compose services are required");
  for (const [name, service] of Object.entries(config.services)) {
    if (service.network_mode === "host")
      throw new Error(`${name}: host networking bypasses binding isolation`);
    for (const port of service.ports ?? []) {
      if (
        !port ||
        typeof port !== "object" ||
        !["127.0.0.1", "::1"].includes(port.host_ip)
      ) {
        throw new Error(
          `${name}: published ports must explicitly bind to loopback`,
        );
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    assertRenderedBindings(
      JSON.parse(readFileSync(process.argv[2] ?? 0, "utf8")),
    );
    console.log("Rendered Compose bindings are loopback-only");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
