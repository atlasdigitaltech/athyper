import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const STRICT = process.argv.includes("--strict");
const QUIET = process.argv.includes("--quiet");

const SCAN_ROOTS = [
  "apps/neon",
  "apps/mesh",
  "apps/admin",
  "packages/apps/admin",
  "packages/apps/mesh",
  "packages/shared",
  "packages/product/design",
  "packages/product/runtime-ui",
  "packages/domain/finance",
] as const;

const FILE_EXTENSIONS = new Set([".css", ".ts", ".tsx"]);
const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
]);

const ALLOWLIST = [
  /^packages\/shared\/theme\/src\/presets\//,
  /^packages\/shared\/theme\/src\/base\.css$/,
  /^packages\/shared\/theme\/src\/tailwind-preset\.ts$/,
  /^packages\/shared\/theme\/src\/theme-contract\.ts$/,
  /^packages\/shared\/theme\/src\/typography\.ts$/,
  /^packages\/shared\/theme\/src\/typography\.generated\.css$/,
  /^packages\/shared\/theme\/src\/presets\/registry\.ts$/,
  /^packages\/product\/design\/icons\/src\/custom\//,
  /^apps\/web\/components\/auth\/SocialLoginButtons\.tsx$/,
] as const;

type Severity = "error" | "warn";

interface Rule {
  name: string;
  severity: Severity;
  pattern: RegExp;
  description: string;
}

const RULES: Rule[] = [
  {
    name: "raw-hex-color",
    severity: "error",
    pattern: /(?<!&)#[0-9A-Fa-f]{3,8}\b/g,
    description: "Use theme variables, semantic color classes, or documented brand/data exceptions.",
  },
  {
    name: "arbitrary-color-utility",
    severity: "error",
    pattern: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|shadow|caret|accent)-\[[^\]]*(?:#|rgb|rgba|hsl|hsla|oklch|lch|lab|white|black|gray|slate|zinc|blue|red|green|yellow|amber|orange)[^\]]*\]/g,
    description: "Use semantic Tailwind tokens instead of arbitrary color utilities.",
  },
  {
    name: "arbitrary-pixel-typography",
    severity: "error",
    pattern: /\b(?:text|leading|tracking|font)-\[(?:-?\d+(?:\.\d+)?(?:px|rem|em)|-?\d+(?:\.\d+)?)\]/g,
    description: "Use typography tokens such as text-doc-support, text-doc-badge, or component variants.",
  },
  {
    name: "direct-palette-utility",
    severity: "warn",
    pattern: /\b(?:bg|text|border|ring|from|via|to|fill|stroke|outline|decoration|shadow|caret|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)(?:-\d{2,3})?(?:\/[0-9]+)?\b/g,
    description: "Prefer theme semantic colors; allow only documented overlays, vendor marks, and inspected data swatches.",
  },
];

interface Finding {
  file: string;
  line: number;
  column: number;
  match: string;
  rule: Rule;
}

function toRepoPath(path: string): string {
  return relative(ROOT, path).replace(/\\/g, "/");
}

function isAllowlisted(file: string): boolean {
  return ALLOWLIST.some((pattern) => pattern.test(file));
}

function extensionOf(path: string): string {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function walk(dir: string, files: string[] = []): string[] {
  if (!existsSync(dir)) return files;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(join(dir, entry.name), files);
      continue;
    }

    const file = join(dir, entry.name);
    if (FILE_EXTENSIONS.has(extensionOf(file))) files.push(file);
  }

  return files;
}

function lineColumnFor(content: string, index: number): { line: number; column: number } {
  const before = content.slice(0, index);
  const lines = before.split(/\r?\n/);
  return { line: lines.length, column: lines[lines.length - 1]!.length + 1 };
}

function collectFindings(): Finding[] {
  const findings: Finding[] = [];
  const files = SCAN_ROOTS.flatMap((root) => walk(join(ROOT, root)));

  for (const absolutePath of files) {
    const file = toRepoPath(absolutePath);
    if (isAllowlisted(file)) continue;

    const content = readFileSync(absolutePath, "utf8");
    for (const rule of RULES) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        const index = match.index ?? 0;
        const position = lineColumnFor(content, index);
        findings.push({
          file,
          line: position.line,
          column: position.column,
          match: match[0],
          rule,
        });
      }
    }
  }

  return findings;
}

function printSummary(findings: Finding[]): void {
  const byRule = new Map<string, Finding[]>();
  for (const finding of findings) {
    const existing = byRule.get(finding.rule.name) ?? [];
    existing.push(finding);
    byRule.set(finding.rule.name, existing);
  }

  console.log("Style token audit");
  console.log(`Mode: ${STRICT ? "strict" : "warning"}`);
  console.log(`Findings: ${findings.length}`);

  for (const rule of RULES) {
    const items = byRule.get(rule.name) ?? [];
    const label = rule.severity.toUpperCase();
    console.log(`- ${rule.name} (${label}): ${items.length}`);
    if (!QUIET && items.length > 0) {
      for (const item of items.slice(0, 12)) {
        console.log(`  ${item.file}:${item.line}:${item.column} ${item.match}`);
      }
      if (items.length > 12) console.log(`  ... ${items.length - 12} more`);
    }
  }
}

const findings = collectFindings();
printSummary(findings);

const errors = findings.filter((finding) => finding.rule.severity === "error");
if (STRICT && errors.length > 0) {
  console.error(`Strict style token audit failed with ${errors.length} error findings.`);
  process.exit(1);
}
