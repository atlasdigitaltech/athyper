import { readFile, stat } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../../../../", import.meta.url);
const compatibilityFiles = new Set([
  "server/packages/foundation/src/context/execution-context.ts",
  "server/packages/platform/iam/src/iam-service.ts",
  "server/packages/platform/iam/src/iam-routes.ts",
  "server/packages/runtime/jobs/src/bullmq-job-runtime.ts",
  "server/packages/platform/metadata/src/descriptor-parser.ts",
]);

describe("Foundation Studio plane-key cutover", () => {
  it("does not retain Athyper as an active logical plane comparison", async () => {
    const violations: string[] = [];
    for await (const relativePath of glob("{apps,packages,server/{apps,packages}}/**/*.{ts,tsx,js,mjs,cjs,sql,yml,yaml,sh,bat}", { cwd: root })) {
      const normalized = relativePath.replaceAll("\\", "/");
      if (normalized.includes("/__tests__/") || normalized.includes("/test/") || normalized.includes("/dist/") || normalized.includes("/node_modules/")) continue;
      const candidate = new URL(normalized, root);
      if(!(await stat(candidate)).isFile())continue;
      const source = await readFile(candidate, "utf8");
      const activeComparison = /(?:planeKey|plane_key|plane)\s*(?:===|!==|==|!=)\s*["']athyper["']|["']athyper["']\s*\|\s*["'](?:neon|mesh|studio)["']|\[\s*["']athyper["']\s*,\s*["'](?:neon|mesh|studio)["']/.test(source);
      if (activeComparison && !compatibilityFiles.has(normalized)) violations.push(normalized);
    }
    expect(violations).toEqual([]);
  }, 30_000);
});
