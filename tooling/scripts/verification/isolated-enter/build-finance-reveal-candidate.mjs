import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const base =
  "sha256:0a2546bd78a84e296dd43d1c59cd710e5e6c582f4ca8f089db056e62baafafd7";
const run = (args) =>
  cp.execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    maxBuffer: 8_000_000,
  });
assert.equal(
  JSON.parse(run(["inspect", "athyper-bp-enter-api"]))[0].Image,
  base,
);
const root =
  os.homedir() +
  "/.athyper/qualification/bp/finance-reveal-candidate-v2-20260912";
const stage = root + "/image";
fs.mkdirSync(stage, { recursive: true });
const master =
  "/app/server/node_modules/.pnpm/@athyper+server-service-master-data@file+server+packages+services+master-data/node_modules/@athyper/server-service-master-data/dist/";
const finance =
  "/app/server/node_modules/.pnpm/@athyper+server-service-finance@file+server+packages+services+finance/node_modules/@athyper/server-service-finance/dist/";
const contract =
  "/app/server/node_modules/.pnpm/@athyper+server-contract-finance@file+server+packages+contracts+finance/node_modules/@athyper/server-contract-finance/dist/";
const files = [
  {
    source: "server/packages/contracts/finance/dist/permissions.js",
    destination: contract + "permissions.js",
  },
  ...["register-services", "business-partner-target-read-policy"].map(
    (name) => ({
      source: "server/apps/platform-host/dist/composition/" + name + ".js",
      destination: "/app/server/dist/composition/" + name + ".js",
    }),
  ),
  ...[
    "business-partner-360-service",
    "business-partner-360-routes",
    "business-partner-360-route-contracts",
  ].map((name) => ({
    source: "server/packages/services/master-data/dist/" + name + ".js",
    destination: master + name + ".js",
  })),
  {
    source:
      "server/packages/services/finance/dist/ledger/business-partner-journal-activity.js",
    destination: finance + "ledger/business-partner-journal-activity.js",
  },
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const file of files) {
  const to = stage + file.destination;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(file.source, to);
  file.sha256 = sha(fs.readFileSync(to));
}
run([
  "cp",
  "athyper-bp-enter-api:" + finance + "index.js",
  stage + "/finance-index.prior.js",
]);
const index = fs.readFileSync(stage + "/finance-index.prior.js", "utf8");
assert(!index.includes("business-partner-journal-activity"));
fs.writeFileSync(
  stage + finance + "index.js",
  index + '\nexport * from "./ledger/business-partner-journal-activity.js";\n',
);
files.push({
  source: "deployed Finance index plus one reader export",
  destination: finance + "index.js",
  sha256: sha(fs.readFileSync(stage + finance + "index.js")),
});
run(["tag", base, "athyper-bp-finance-reveal-base:20260912"]);
fs.writeFileSync(
  stage + "/Dockerfile",
  "FROM athyper-bp-finance-reveal-base:20260912\n" +
    files
      .map((f) => `COPY ${f.destination.slice(1)} ${f.destination}`)
      .join("\n") +
    "\n",
);
run([
  "build",
  "--network=none",
  "-t",
  "athyper-bp-finance-reveal-candidate:v2-20260912",
  stage,
]);
const image = JSON.parse(
  run(["image", "inspect", "athyper-bp-finance-reveal-candidate:v2-20260912"]),
)[0].Id;
fs.writeFileSync(
  root + "/image.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      base,
      image,
      files,
      scope:
        "NEON server candidate only; not deployed, not an execution approval; UI scope propagation remains local source.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log({ base, image, files: files.length, deployed: false });
