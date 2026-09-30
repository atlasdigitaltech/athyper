// Loopback-only browser transport. Preserve the real app origin throughout OIDC redirects.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import { proposalPrefix } from "./affordance-count-run.mjs";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const proposal = JSON.parse(
  fs.readFileSync(
    new URL(
      "../../../../" + proposalPrefix + ".proposal.dev.json",
      import.meta.url,
    ),
  ),
);
const ui = JSON.parse(
  execFileSync("docker", ["inspect", "athyper-bp-enter-neon-ui"], {
    encoding: "utf8",
  }),
)[0];
assert.equal(ui.Image, proposal.uiImage);
assert.equal(ui.State.Running, true);
https
  .createServer(
    {
      key: fs.readFileSync(root + "/ui-transport.key"),
      cert: fs.readFileSync(root + "/ui-transport.crt"),
    },
    (req, res) => {
      const upstream = http.request(
        {
          host: "127.0.0.1",
          port: 13319,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: "neon.dev.athyper.test",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "neon.dev.athyper.test",
          },
        },
        (r) => {
          res.writeHead(r.statusCode, {
            ...r.headers,
            "x-qualification-ui-image": ui.Image,
          });
          r.pipe(res);
        },
      );
      upstream.on("error", () => res.writeHead(502).end());
      req.pipe(upstream);
    },
  )
  .listen(13321, "127.0.0.1");
const proxy = http.createServer((_req, res) => res.writeHead(403).end());
proxy.on("connect", (req, socket, head) => {
  if (
    !["neon.dev.athyper.test:443", "iam.dev.athyper.test:443"].includes(req.url)
  ) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const local = req.url.startsWith("neon.");
  const upstream = net.connect(
    local ? 13321 : 443,
    local ? "127.0.0.1" : "iam.dev.athyper.test",
    () => {
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) upstream.write(head);
      socket.pipe(upstream);
      upstream.pipe(socket);
    },
  );
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});
proxy.listen(13320, "127.0.0.1", () =>
  console.log(
    "Isolated browser transport ready on loopback; only NEON and IAM permitted",
  ),
);
