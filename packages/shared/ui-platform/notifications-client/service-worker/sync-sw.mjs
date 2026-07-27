import { copyFile, mkdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const serviceWorkerDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serviceWorkerDir, "../../../../..");
const source = path.join(serviceWorkerDir, "sw.template.js");
const expected = await readFile(source, "utf8");

for (const app of ["neon", "mesh", "admin"]) {
  const publicDir = path.join(repositoryRoot, "apps", app, "public");
  const target = path.join(publicDir, "sw.js");
  await mkdir(publicDir, { recursive: true });
  await copyFile(source, target);
  const actual = await readFile(target, "utf8");
  if (actual !== expected) throw new Error(`Service-worker sync failed for ${app}`);
}
