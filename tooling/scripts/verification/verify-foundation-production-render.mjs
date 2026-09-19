#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("../../..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const failures = [];
for (const plane of ["neon", "mesh", "studio"]) {
  const file = resolve(root, "apps", plane, ".next", "server", "app", "index.html");
  if (!existsSync(file)) { failures.push(`${plane}: production HTML is missing; run its build first`); continue; }
  const html = readFileSync(file, "utf8");
  const script = html.indexOf('data-athyper-theme-script="true"'); const body = html.indexOf("<body");
  if (script < 0 || body < 0 || script > body) failures.push(`${plane}: theme bootstrap is not emitted before body`);
  if (!html.includes("dataset.theme") || !html.includes("prefers-color-scheme")) failures.push(`${plane}: production bootstrap lacks theme resolution logic`);
}
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; } else console.log("Production theme bootstrap verified before body in Neon, Mesh, and Studio.");
