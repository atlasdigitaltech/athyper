#!/usr/bin/env node
/**
 * Athyper Clean-Deep Utility
 *
 * Recursively removes:
 *  - node_modules
 *  - .turbo
 *
 * Safety:
 *  - Only runs if repo root looks like Athyper (guards)
 *  - Skips .git
 *  - Skips symlinks
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repo root = two levels up from tooling/devtools
const ROOT = path.resolve(__dirname, "../..");

const TARGETS = new Set(["node_modules", ".turbo"]);
let removedCount = 0;

function exists(p) {
    try {
        fs.accessSync(p);
        return true;
    } catch {
        return false;
    }
}

// ---- Hard guard: must look like repo root ----
const guardFiles = [
    path.join(ROOT, "package.json"),
    path.join(ROOT, "pnpm-workspace.yaml"),
    path.join(ROOT, "turbo.json"),
];

if (!guardFiles.every(exists)) {
    console.error("❌ Refusing to run: repo root guard failed:", ROOT);
    process.exit(1);
}

// Optional: ensure package.json name is "athyper"
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    if (pkg?.name !== "athyper") {
        console.error("❌ Refusing to run: package.json name is not 'athyper'. Found:", pkg?.name);
        process.exit(1);
    }
} catch {
    console.error("❌ Refusing to run: cannot read package.json at:", ROOT);
    process.exit(1);
}

function walk(dir) {
    let entries;
    try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.name === ".git") continue;

        // Skip symlinks (important in monorepos + pnpm)
        if (entry.isSymbolicLink?.()) continue;

        if (entry.isDirectory() && TARGETS.has(entry.name)) {
            try {
                fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3 });
                removedCount++;
                console.log("🧹 Removed:", path.relative(ROOT, fullPath));
            } catch (err) {
                console.warn("⚠️ Failed:", path.relative(ROOT, fullPath), err?.message ?? err);
            }
            continue;
        }

        if (entry.isDirectory()) walk(fullPath);
    }
}

console.log("🔍 Cleaning from:", ROOT);
walk(ROOT);
console.log(`✅ Clean complete. Removed ${removedCount} directories.`);
