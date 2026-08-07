#!/usr/bin/env tsx
/**
 * Build the standalone Keycloak IAM stylesheet.
 *
 * IAM branding is a brand concern: it controls which wordmark, colour tokens,
 * and component classes Keycloak login pages receive.
 *
 * Output:
 *   stack/config/iam/themes/neon/login/resources/css/iam.tokens.css
 *   stack/config/iam/themes/neon/login/resources/css/iam.generated.css
 *   stack/config/iam/themes/neon/login/resources/fonts/Geist-Variable.woff2
 *
 * Run:
 *   pnpm --filter @athyper/platform-brand iam:build
 */

import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "tailwindcss";

const scriptDir   = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "../..");           // src/iam/ → package root
const repoRoot    = path.resolve(packageRoot, "../../../..");   // package → monorepo root
const iamRoot     = path.join(repoRoot, "stack/config/iam/themes/neon/login");
const outputRoot  = path.join(iamRoot, "resources/css");
const fontOutputRoot = path.join(iamRoot, "resources/fonts");

const require = createRequire(import.meta.url);

const themeRoot      = path.dirname(require.resolve("@athyper/platform-theme/package.json"));
const tokensSource   = path.join(themeRoot, "src/tokens/athyper.tokens.css");
const componentsSource = path.join(packageRoot, "src/iam/iam-components.css");

const geistModule        = require.resolve("geist/font");
const geistVariableSource = path.join(
  path.dirname(geistModule),
  "fonts/geist-sans/Geist-Variable.woff2",
);

const IAM_FONT_FACE = `
@font-face {
  font-family: "Geist";
  src: url("../fonts/Geist-Variable.woff2") format("woff2");
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
}
`;

const IAM_COMPATIBILITY_BRIDGE = `
:root {
  --background: var(--athyper-color-bg);
  --foreground: var(--athyper-color-text);
  --card: var(--athyper-color-surface-raised);
  --card-foreground: var(--athyper-color-text);
  --popover: var(--athyper-color-surface-raised);
  --popover-foreground: var(--athyper-color-text);
  --primary: var(--athyper-color-primary);
  --primary-foreground: var(--athyper-color-primary-foreground);
  --secondary: var(--athyper-color-surface);
  --secondary-foreground: var(--athyper-color-text);
  --accent: var(--athyper-color-surface);
  --accent-foreground: var(--athyper-color-text);
  --muted: var(--athyper-color-surface);
  --muted-foreground: var(--athyper-color-muted);
  --destructive: var(--athyper-color-danger);
  --destructive-foreground: #ffffff;
  --success: var(--athyper-color-success);
  --warning: var(--athyper-color-warning);
  --info: var(--athyper-color-info);
  --border: var(--athyper-color-border);
  --input: var(--athyper-color-border);
  --ring: #3b82f6;
  --radius: var(--athyper-radius-md);
  --shadow-sm: var(--athyper-shadow-sm);
  --shadow-md: var(--athyper-shadow-md);
  --bg: var(--athyper-color-bg);
  --fg: var(--athyper-color-text);
  --primary-fg: var(--athyper-color-primary-foreground);
  --muted-fg: var(--athyper-color-muted);
  --input-bg: var(--athyper-color-surface-raised);
}
`;

const UTILITY_SAFELIST = [
  "block", "flex", "inline-flex", "grid", "hidden",
  "min-h-screen", "min-h-dvh", "w-full", "max-w-md",
  "items-center", "justify-center", "justify-between",
  "gap-2", "gap-3", "gap-4", "space-y-2", "space-y-3", "space-y-4",
  "rounded-md", "rounded-lg", "border", "border-transparent",
  "bg-background", "bg-surface", "bg-white",
  "p-4", "p-6", "px-4", "py-2",
  "text-center", "text-sm", "text-base",
  "font-medium", "font-semibold",
  "text-foreground", "text-muted", "text-primary-foreground",
  "shadow-sm", "shadow-md",
  "focus:outline-none",
] as const;

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(absolute)));
    else if (entry.isFile() && entry.name.endsWith(".ftl")) files.push(absolute);
  }
  return files;
}

async function scanTemplateCandidates(): Promise<string[]> {
  const files = await listFiles(iamRoot);
  const candidates = new Set<string>();
  const classPattern = /class\s*=\s*"([^"]+)"/g;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(classPattern)) {
      for (const candidate of match[1].split(/\s+/)) {
        if ((UTILITY_SAFELIST as readonly string[]).includes(candidate)) {
          candidates.add(candidate);
        }
      }
    }
  }
  return [...candidates];
}

async function main(): Promise<void> {
  const scannedCandidates = await scanTemplateCandidates();
  const candidates = [...new Set([...UTILITY_SAFELIST, ...scannedCandidates])];

  const compiler = await compile(
    `
      @theme inline {
        --color-background: var(--athyper-color-bg);
        --color-surface: var(--athyper-color-surface);
        --color-foreground: var(--athyper-color-text);
        --color-muted: var(--athyper-color-muted);
        --color-border: var(--athyper-color-border);
        --color-primary-foreground: var(--athyper-color-primary-foreground);
        --color-white: #ffffff;
        --radius-md: var(--athyper-radius-md);
        --radius-lg: var(--athyper-radius-lg);
        --shadow-sm: var(--athyper-shadow-sm);
        --shadow-md: var(--athyper-shadow-md);
        --spacing: 0.25rem;
        --font-sans: var(--athyper-font-sans);
        --text-sm: 0.875rem;
        --text-sm--line-height: 1.25rem;
        --text-base: 1rem;
        --text-base--line-height: 1.5rem;
        --font-weight-medium: 500;
        --font-weight-semibold: 600;
      }
      @tailwind utilities;
    `,
    { base: repoRoot },
  );

  const [tokens, components] = await Promise.all([
    readFile(tokensSource, "utf8"),
    readFile(componentsSource, "utf8"),
  ]);
  const utilities = compiler.build(candidates);

  const banner = [
    "/*",
    " * Generated by @athyper/platform-brand/src/iam/build-iam-css.ts.",
    " * DO NOT EDIT DIRECTLY — run: pnpm --filter @athyper/platform-brand iam:build",
    " *",
    ` * Utility candidates: ${candidates.length}`,
    " */",
    "",
  ].join("\n");

  await mkdir(fontOutputRoot, { recursive: true });
  await Promise.all([
    copyFile(geistVariableSource, path.join(fontOutputRoot, "Geist-Variable.woff2")),
    writeFile(
      path.join(outputRoot, "iam.tokens.css"),
      `${IAM_FONT_FACE.trim()}\n\n${tokens.trim()}\n${IAM_COMPATIBILITY_BRIDGE}`,
      "utf8",
    ),
    writeFile(
      path.join(outputRoot, "iam.generated.css"),
      `${banner}${utilities}\n\n${components.trim()}\n`,
      "utf8",
    ),
  ]);

  console.log(`IAM CSS built (${candidates.length} utility candidates).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
