import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";

const budgets = JSON.parse(readFileSync(
  new URL("../../config/production-experience-budgets.json", import.meta.url),
  "utf8",
));
const budget = budgets.bundleBudgets?.sharedShellGzipBytes;
if (!Number.isFinite(budget) || budget <= 0) {
  throw new Error("shared shell gzip budget is missing or invalid");
}

const result = await build({
  entryPoints: ["packages/platform/shell/shell/src/index.tsx"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: true,
  treeShaking: true,
  write: false,
  logLevel: "silent",
  external: ["react", "react/*", "react-dom", "react-dom/*", "lucide-react", "@athyper/*"],
});
const gzipBytes = gzipSync(result.outputFiles[0].contents, { level: 9 }).byteLength;
if (gzipBytes > budget) {
  throw new Error(`shared shell bundle ${gzipBytes} gzip bytes exceeds ${budget}`);
}
process.stdout.write(`Shared shell bundle verified: ${gzipBytes}/${budget} gzip bytes.\n`);
