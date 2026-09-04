#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { build } from "esbuild";
import { importSpecifiers } from "./frontend-spine-governance.mjs";

const root = resolve(new URL("../../..", import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)));
const foundation = join(root, "packages", "platform", "foundation");
const packageRules = {
  brand: { allowed: [] }, theme: { allowed: ["react", "@athyper/platform-brand"] }, icons: { allowed: ["react"] },
  ui: { allowed: ["react", "@athyper/platform-theme"] },
  "surface-kit": { allowed: ["react", "@athyper/platform-ui"] },
};
const violations = [];
const sourceFiles = (directory) => readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? sourceFiles(join(directory, entry.name)) : /\.(?:ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);

for (const [name, rule] of Object.entries(packageRules)) {
  for (const file of sourceFiles(join(foundation, name, "src"))) {
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (specifier.startsWith(".") || rule.allowed.some((allowed) => specifier === allowed || specifier.startsWith(`${allowed}/`))) continue;
      violations.push(`${relative(root, file)} imports disallowed dependency ${specifier}`);
    }
  }
}

const forbiddenUiTerms = /(?:entity|finance|workflow|navigation|session|api-client|query-client|business)/i;
for (const file of sourceFiles(join(foundation, "ui", "src"))) for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) if (forbiddenUiTerms.test(specifier)) violations.push(`${relative(root, file)} imports business/runtime concern ${specifier}`);

const cssFiles = [join(foundation, "theme", "src", "styles.css"), join(foundation, "theme", "src", "tailwind.css"), join(foundation, "ui", "src", "styles.css"), join(foundation, "surface-kit", "src", "styles.css"), join(root, "packages", "platform", "iam", "identity-gate", "src", "styles.css")];
const cssBytes = cssFiles.reduce((total, file) => total + statSync(file).size, 0);
if (cssBytes > 24 * 1024) violations.push(`Foundation CSS is ${cssBytes} bytes; budget is 24576 bytes`);
const tokenBytes = statSync(join(foundation, "theme", "src", "tokens.ts")).size;
if (tokenBytes > 12 * 1024) violations.push(`Theme token source is ${tokenBytes} bytes; budget is 12288 bytes`);

const bundle = await build({ entryPoints: [join(foundation, "icons", "src", "check.tsx")], bundle: true, minify: true, write: false, platform: "browser", format: "esm", external: ["react", "react/jsx-runtime"], treeShaking: true });
const bundled = bundle.outputFiles[0]?.text ?? "";
if (bundled.includes("M4 7h16") || bundled.includes("M12 3 2.5 20")) violations.push("Single-icon bundle eagerly included unrelated semantic icons");
if (Buffer.byteLength(bundled) > 1800) violations.push(`Single-icon bundle is ${Buffer.byteLength(bundled)} bytes; budget is 1800 bytes`);

for (const plane of ["neon", "mesh", "studio"]) {
  const layout = readFileSync(join(root, "apps", plane, "app", "layout.tsx"), "utf8");
  if (!layout.includes('@athyper/platform-theme/styles.css') || !layout.includes("<head><ThemeScript") || layout.indexOf("<ThemeScript") > layout.indexOf("<body>")) violations.push(`${plane} layout does not synchronously bootstrap theme before body`);
  if (!layout.includes("getPlaneWebMetadata") || !layout.includes("manifest:") || !layout.includes("apple:")) violations.push(`${plane} layout does not derive complete browser metadata from the brand registry`);
  for (const file of sourceFiles(join(root, "apps", plane, "app"))) {
    const source = readFileSync(file, "utf8");
    if (/\bstyle\s*=/.test(source)) violations.push(`${relative(root, file)} defines inline visual styles instead of consuming the design system`);
    if (/#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(source)) violations.push(`${relative(root, file)} contains a literal color instead of a semantic theme token`);
  }
  for (const page of [join(root, "apps", plane, "app", "(public)", "sign-in", "page.tsx"), join(root, "apps", plane, "app", "(public)", "select-context", "page.tsx")]) {
    const source = readFileSync(page, "utf8");
    if (!source.includes('@athyper/platform-iam-identity-gate')) violations.push(`${relative(root, page)} does not consume the production identity-gate surface`);
  }
  const brand = plane === "studio" ? "studio" : plane;
  for (const asset of ["identity-lockup.svg", "app-icon.png", "athyper-favicon.svg", "manifest.webmanifest"]) if (!statSync(join(root, "apps", plane, "public", "brand", brand, asset)).isFile()) violations.push(`${plane} is missing production brand asset ${asset}`);
}

const authCss = readFileSync(join(root, "packages", "platform", "iam", "identity-gate", "src", "styles.css"), "utf8");
const authSource = readFileSync(join(root, "packages", "platform", "iam", "identity-gate", "src", "index.tsx"), "utf8");
if (/#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(authCss)) violations.push("Identity-gate CSS contains literal colors instead of semantic theme tokens");
if (!authSource.includes("brand.identityLockup.src") || authSource.includes("a-auth-wordmark")) violations.push("Identity gate does not render registered pre-authentication plane lockups");
if (/--a-auth-/.test(readFileSync(join(root, "packages", "platform", "foundation", "theme", "src", "styles.css"), "utf8"))) violations.push("Global theme exposes component-specific authentication tokens");
if (/\.a-identity-/.test(readFileSync(join(root, "packages", "platform", "foundation", "theme", "src", "styles.css"), "utf8"))) violations.push("Global theme owns identity-gate selectors");
if (!authCss.includes('@import "@athyper/platform-surface-kit/styles.css"')) violations.push("Identity gate does not compose the shared surface-kit stylesheet");
if (!authSource.includes("PublicIdentitySurface") || !authSource.includes("@athyper/platform-ui/presentation")) violations.push("Identity gate does not compose shared surface and UI presentation primitives");

const iamLoginCss = readFileSync(join(root, "stack", "config", "iam", "themes", "neon", "login", "resources", "css", "login.css"), "utf8");
const iamTokenCss = readFileSync(join(root, "stack", "config", "iam", "themes", "neon", "login", "resources", "css", "iam.tokens.css"), "utf8");
if (/#[0-9a-f]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i.test(iamLoginCss)) violations.push("Keycloak login composition contains literal colors instead of active semantic theme tokens");
if (!iamTokenCss.includes("GENERATED from @athyper/platform-theme/src/tokens.ts")) violations.push("Keycloak token sheet is not generated from the active theme authority");
if (!iamTokenCss.includes("--a-theme-family:atlas-modern") || !iamTokenCss.includes("--a-primary: #234B84")) violations.push("Keycloak token sheet does not default to Atlas Modern");
for (const token of ["background", "border", "contrast", "contrast-foreground"]) if (!iamLoginCss.includes(`var(--a-${token})`)) violations.push(`Keycloak login surface does not consume universal --a-${token}`);

if (violations.length) { console.error(["Foundation Phase 1 policy failed:", ...violations.map((item) => `- ${item}`)].join("\n")); process.exitCode = 1; }
else console.log(`Foundation Phase 1 verified: purity, tree-shaking, pre-paint bootstrap, ${cssBytes}-byte CSS budget, and ${tokenBytes}-byte token budget.`);
