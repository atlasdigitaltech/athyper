import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../../deploy/stackctl/package.json", import.meta.url),
);
const YAML = require("yaml");

// Review deployments run Next.js, independently of the runtime API's port 4000.
export function assertReviewPorts(compose) {
  for (const kind of ["operation", "role"]) {
    const name = `bp-${kind}-review`,
      service = compose.services?.[name];
    if (!service) continue;
    const env = Array.isArray(service.environment)
      ? Object.fromEntries(
          service.environment.map((value) => {
            const i = value.indexOf("=");
            return [value.slice(0, i), value.slice(i + 1)];
          }),
        )
      : (service.environment ?? {});
    const config = YAML.parse(
      readFileSync(
        new URL(
          `../../../deploy/compose/instance/config/traefik/reviews/${kind}.yaml`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const port = new URL(config.http.services[name].loadBalancer.servers[0].url)
      .port;
    if (String(env.PORT) !== port)
      throw new Error(
        `${name}: explicit PORT must match Traefik target ${port}`,
      );
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3)
    throw new Error(
      "Usage: node review-port-contract.mjs <generated-compose.json>",
    );
  assertReviewPorts(JSON.parse(readFileSync(process.argv[2], "utf8")));
  console.log("Review application ports match Traefik targets");
}
