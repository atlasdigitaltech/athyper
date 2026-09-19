// Loopback-only browser transport. Preserve the real app origin throughout OIDC redirects.
import http from "node:http";
import https from "node:https";
import net from "node:net";
import fs from "node:fs";
import os from "node:os";
const uiImage =
  process.env.BP_QUALIFICATION_STUDIO_UI_IMAGE ??
  "sha256:7eeb739fdb7a99937a9be9c0c0e4b3a5f88d4f956985d022813d55127ab76621";
if (!/^sha256:[a-f0-9]{64}$/.test(uiImage))
  throw Error("Pinned Studio UI image required");
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
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
          port: 13329,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            host: "studio.dev.athyper.test",
            "x-forwarded-proto": "https",
            "x-forwarded-host": "studio.dev.athyper.test",
          },
        },
        (r) => {
          res.writeHead(r.statusCode, {
            ...r.headers,
            "x-qualification-ui-image": uiImage,
          });
          r.pipe(res);
        },
      );
      upstream.on("error", () => res.writeHead(502).end());
      req.pipe(upstream);
    },
  )
  .listen(13331, "127.0.0.1");
const proxy = http.createServer((_req, res) => res.writeHead(403).end());
proxy.on("connect", (req, socket, head) => {
  if (
    !["studio.dev.athyper.test:443", "iam.dev.athyper.test:443"].includes(
      req.url,
    )
  ) {
    socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
    return;
  }
  const local = req.url.startsWith("studio.");
  const upstream = net.connect(
    local ? 13331 : 443,
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
proxy.listen(13330, "127.0.0.1", () =>
  console.log(
    "Isolated browser transport ready on loopback; only Studio and IAM permitted",
  ),
);
