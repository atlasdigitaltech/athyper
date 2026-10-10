import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

// Hardcoded user-facing text in a localized package (shared list layout
// foundation, known gaps 1, 7 and 8). Flags English in JSX text, in
// user-facing attributes and props, and any template literal in such an
// attribute: text built from several values goes through a parameterized
// message, never a template. Also flags the three shapes that reach the screen
// indirectly: English returned from a helper (directly, through a conditional
// or fallback, or from a lookup map), an inline locale map (`{ en: "…" }`), and
// English as the default value of a label-like parameter. Deliberate English
// is listed in an allowlist with its reason, and an allowlist entry that no
// longer matches fails too, so the list stays short.

const ATTRIBUTES = new Set(["title", "aria-label", "placeholder", "label", "alt", "aria-description", "aria-roledescription", "description", "emptyMessage", "summary", "heading", "closeLabel", "caption"]);
const WORD = /[A-Za-z]{2,}/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [path] : [];
  });
}

const LABEL_PARAMETER = /(label|title|text|placeholder|message|caption|heading|description|summary)$/i;
// Returned text reads as words: a capitalised word, not a code, class or id.
const RETURNED_WORDS = /^[A-Z][a-z]+(?:[\s,.;:!?'’-]|$)/;

const literalOf = (node) => (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) ? node : undefined);

/** The returned value a literal ends up as, through conditionals, fallbacks,
 * parentheses, casts and lookup maps (`({ eq: "Equals" })[operator]`). */
function returned(node) {
  let current = node;
  for (let parent = node.parent; parent; current = parent, parent = parent.parent) {
    if (ts.isReturnStatement(parent)) return true;
    if (ts.isArrowFunction(parent)) return parent.body === current;
    if (ts.isParenthesizedExpression(parent) || ts.isAsExpression(parent) || ts.isSatisfiesExpression(parent) || ts.isNonNullExpression(parent)) continue;
    if (ts.isConditionalExpression(parent)) { if (parent.condition === current) return false; continue; }
    if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind)) continue;
    if (ts.isPropertyAssignment(parent) && parent.initializer === current) continue;
    if (ts.isObjectLiteralExpression(parent)) continue;
    if (ts.isElementAccessExpression(parent) && parent.expression === current) continue;
    return false;
  }
  return false;
}

const propertyName = (name) => (ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : undefined);

/** Each literal in one file's source: { line, kind, text }. */
export function findLiteralText(source, fileName = "source.tsx") {
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const add = (node, kind, text) => found.push({ line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1, kind, text });
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const text = node.getText().trim();
      if (WORD.test(text)) add(node, "text", text);
    } else if (ts.isJsxAttribute(node) && node.initializer && ATTRIBUTES.has(node.name.getText())) {
      const initializer = node.initializer;
      const expression = ts.isJsxExpression(initializer) ? initializer.expression : undefined;
      const literal = ts.isStringLiteral(initializer) ? initializer : literalOf(expression);
      if (literal && WORD.test(literal.text)) add(node, node.name.getText(), literal.text);
      if (expression && ts.isTemplateExpression(expression)) add(node, `${node.name.getText()} template`, expression.getText());
    } else if (literalOf(node)) {
      let child = false;
      // A literal rendered as a JSX child: {open ? "Hide all" : label}.
      if (/[A-Za-z]{2,}\s+[A-Za-z]/.test(node.text))
        for (let parent = node.parent; parent && !ts.isJsxAttribute(parent) && !ts.isCallExpression(parent) && !ts.isVariableDeclaration(parent); parent = parent.parent)
          if (ts.isJsxExpression(parent) && parent.parent && (ts.isJsxElement(parent.parent) || ts.isJsxFragment(parent.parent))) {
            add(node, "child", node.text);
            child = true;
            break;
          }
      if (!child && RETURNED_WORDS.test(node.text) && returned(node)) add(node, "returned text", node.text);
      if (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node && propertyName(node.parent.name) === "en" && WORD.test(node.text)) add(node, "locale map", node.text);
      if ((ts.isBindingElement(node.parent) || ts.isParameter(node.parent)) && node.parent.initializer === node && ts.isIdentifier(node.parent.name) && LABEL_PARAMETER.test(node.parent.name.text) && WORD.test(node.text))
        add(node, `default ${node.parent.name.text}`, node.text);
    } else if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.initializer) && ATTRIBUTES.has(node.name.getText().replace(/["']/g, "")) && /[A-Za-z]{2,}\s/.test(node.initializer.text)) {
      add(node, `${node.name.getText()} property`, node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Violations under each directory, less the allowlist; stale allowlist entries are violations too. */
export function analyzeUserFacingLiterals({ root, directories, allowlist }) {
  const violations = [], used = new Set();
  for (const directory of directories)
    for (const path of sourceFiles(join(root, directory))) {
      const file = relative(root, path).split("\\").join("/");
      for (const item of findLiteralText(readFileSync(path, "utf8"), path)) {
        const allowed = allowlist.findIndex((entry) => entry.file === file && entry.text === item.text);
        if (allowed >= 0) used.add(allowed);
        else violations.push(`${file}:${item.line} hardcoded ${item.kind} "${item.text}": use a catalogue message`);
      }
    }
  allowlist.forEach((entry, index) => {
    if (!used.has(index)) violations.push(`${entry.file}: allowlisted "${entry.text}" no longer appears; remove it from the allowlist`);
  });
  return violations;
}

export const LOCALIZED_DIRECTORIES = ["packages/platform/entity/runtime/list-view/src", "packages/platform/entity/runtime/collection-controls/src"];

export const LITERAL_ALLOWLIST = [
  { file: "packages/platform/entity/runtime/list-view/src/data-operations.tsx", text: "Imported example contract", reason: "sample row inside a downloaded import template: file content, not interface text" },
  { file: "packages/platform/entity/runtime/list-view/src/drawer-registry.tsx", text: "Group by", reason: "drawer registry English fallback; the UI reads list.controls.<key>.*" },
  { file: "packages/platform/entity/runtime/list-view/src/drawer-registry.tsx", text: "Display settings", reason: "drawer registry English fallback; the UI reads list.controls.<key>.*" },
  { file: "packages/platform/entity/runtime/list-view/src/drawer-registry.tsx", text: "Manage views", reason: "drawer registry English fallback; the UI reads list.controls.<key>.*" },
  { file: "packages/platform/entity/runtime/list-view/src/data-operations.tsx", text: "Excel (.xlsx)", reason: "file format name with its extension, as CSV, JSON and NDJSON beside it; not translated" },
  { file: "packages/platform/entity/runtime/list-view/src/field-format.ts", text: "Yes", reason: "offline fallback when no runtime is given; every caller passes one, and the runtime path reads entity.value.yes" },
  { file: "packages/platform/entity/runtime/list-view/src/field-format.ts", text: "No", reason: "offline fallback when no runtime is given; every caller passes one, and the runtime path reads entity.value.no" },
];
