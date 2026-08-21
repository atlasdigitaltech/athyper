#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { verifyFrontendSpine } from "./frontend-spine-governance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const violations = verifyFrontendSpine(root);
if (violations.length) {
  console.error(["Frontend spine governance failed:", ...violations.map((item) => `- ${item}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log("Frontend spine governance verified: ownership, dependency budgets, contracts, exports, workspace, and reference-tree isolation.");
}
