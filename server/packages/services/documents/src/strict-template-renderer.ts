import { DocumentError } from "./errors.js";

const TOKEN = /{{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*}}/g;

/** Strict escaped-variable subset of Handlebars for the first governed slice. */
export function renderStrictHandlebars(template: string, data: Readonly<Record<string, unknown>>, variablesSchema?: Readonly<Record<string, unknown>>): string {
  if (!template.trim()) throw new DocumentError(422, "EMPTY_TEMPLATE", "Published template content is empty");
  if (template.length > 5 * 1024 * 1024) throw new DocumentError(413, "TEMPLATE_TOO_LARGE", "Published template exceeds 5 MiB");
  if (/{{{/.test(template) || /{{\s*[#/>!^]/.test(template)) throw new DocumentError(422, "UNSUPPORTED_TEMPLATE_SYNTAX", "Raw values, helpers, blocks, partials, and comments are not enabled in the strict runtime renderer");
  validateSchema(data, variablesSchema);
  if (/{{|}}/.test(template.replace(TOKEN, ""))) throw new DocumentError(422, "UNSUPPORTED_TEMPLATE_SYNTAX", "Published template contains unsupported syntax");
  const rendered = template.replace(TOKEN, (_token, path: string) => {
    const value = resolvePath(data, path);
    if (value === undefined || value === null) throw new DocumentError(422, "MISSING_TEMPLATE_VARIABLE", `Missing template variable: ${path}`);
    if (!["string", "number", "boolean"].includes(typeof value)) throw new DocumentError(422, "NON_SCALAR_TEMPLATE_VARIABLE", `Template variable must be scalar: ${path}`);
    return escapeHtml(String(value));
  });
  return rendered;
}

function resolvePath(data: Readonly<Record<string, unknown>>, path: string): unknown {
  let value: unknown = data;
  for (const segment of path.split(".")) {
    if (["__proto__", "prototype", "constructor"].includes(segment) || !value || typeof value !== "object" || Array.isArray(value)) return undefined;
    if (!Object.hasOwn(value, segment)) return undefined;
    value = (value as Readonly<Record<string, unknown>>)[segment];
  }
  return value;
}
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (character) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[character]!); }
function validateSchema(data: Readonly<Record<string, unknown>>, schema?: Readonly<Record<string, unknown>>): void {
  if (!schema) return;
  const required = schema["required"];
  if (required !== undefined && (!Array.isArray(required) || required.some((key) => typeof key !== "string"))) throw new DocumentError(500, "INVALID_VARIABLE_SCHEMA", "Published template variable schema is invalid");
  for (const key of (required ?? []) as string[]) if (data[key] === undefined || data[key] === null) throw new DocumentError(422, "MISSING_TEMPLATE_VARIABLE", `Missing required template variable: ${key}`);
}
