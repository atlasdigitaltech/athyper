import type { JsonRuleEvaluator } from "@athyper/server-contract-policy";

export interface JsonRuleEvaluatorLimits { readonly maxDepth?: number; readonly maxNodes?: number; readonly maxArrayLength?: number; readonly maxStringLength?: number; }
export class PolicyExpressionError extends Error { constructor(readonly code: string, message: string) { super(message); this.name = "PolicyExpressionError"; } }

export function createJsonRuleEvaluator(limits: JsonRuleEvaluatorLimits = {}): JsonRuleEvaluator {
  const configured = { maxDepth: limits.maxDepth ?? 32, maxNodes: limits.maxNodes ?? 1_000, maxArrayLength: limits.maxArrayLength ?? 256, maxStringLength: limits.maxStringLength ?? 8_192 };
  return { evaluate(expression, facts) { const budget = { nodes: 0 }; return evaluate(expression, facts, facts, 0, budget, configured); } };
}

function evaluate(node: unknown, facts: Readonly<Record<string, unknown>>, current: unknown, depth: number, budget: { nodes: number }, limits: Required<JsonRuleEvaluatorLimits>): unknown {
  budget.nodes += 1;
  if (budget.nodes > limits.maxNodes) throw new PolicyExpressionError("POLICY_EXPRESSION_TOO_LARGE", "Policy expression exceeds node limit");
  if (depth > limits.maxDepth) throw new PolicyExpressionError("POLICY_EXPRESSION_TOO_DEEP", "Policy expression exceeds depth limit");
  if (typeof node === "string" && node.length > limits.maxStringLength) throw new PolicyExpressionError("POLICY_STRING_TOO_LARGE", "Policy string exceeds limit");
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) {
    if (node.length > limits.maxArrayLength) throw new PolicyExpressionError("POLICY_ARRAY_TOO_LARGE", "Policy array exceeds limit");
    return node.map((entry) => evaluate(entry, facts, current, depth + 1, budget, limits));
  }
  const entries = Object.entries(node as Record<string, unknown>);
  if (entries.length === 0) return true;
  if (entries.length !== 1) throw new PolicyExpressionError("POLICY_EXPRESSION_INVALID", "A policy expression object must contain exactly one operator");
  const [operator, raw] = entries[0]!;
  const rawArgs = Array.isArray(raw) ? raw : [raw];
  const args = () => rawArgs.map((entry) => evaluate(entry, facts, current, depth + 1, budget, limits));
  switch (operator) {
    case "var": { const spec = Array.isArray(raw) ? raw : [raw]; const path = String(spec[0] ?? ""); const fallback = spec[1] === undefined ? null : evaluate(spec[1], facts, current, depth + 1, budget, limits); return getVariable(path ? current : facts, path, fallback); }
    case "==": { const value = args(); return comparable(value[0]) === comparable(value[1]); }
    case "===": { const value = args(); return value[0] === value[1]; }
    case "!=": { const value = args(); return comparable(value[0]) !== comparable(value[1]); }
    case "!==": { const value = args(); return value[0] !== value[1]; }
    case ">": return compare(args(), (a, b) => a > b);
    case ">=": return compare(args(), (a, b) => a >= b);
    case "<": return compare(args(), (a, b) => a < b);
    case "<=": return compare(args(), (a, b) => a <= b);
    case "!": return !truthy(evaluate(rawArgs[0], facts, current, depth + 1, budget, limits));
    case "!!": return truthy(evaluate(rawArgs[0], facts, current, depth + 1, budget, limits));
    case "and": { let result: unknown = null; for (const entry of rawArgs) { result = evaluate(entry, facts, current, depth + 1, budget, limits); if (!truthy(result)) return result; } return result; }
    case "or": { let result: unknown = null; for (const entry of rawArgs) { result = evaluate(entry, facts, current, depth + 1, budget, limits); if (truthy(result)) return result; } return result; }
    case "if": case "?:": { for (let index = 0; index < rawArgs.length - 1; index += 2) if (truthy(evaluate(rawArgs[index], facts, current, depth + 1, budget, limits))) return evaluate(rawArgs[index + 1], facts, current, depth + 1, budget, limits); return rawArgs.length % 2 === 1 ? evaluate(rawArgs.at(-1), facts, current, depth + 1, budget, limits) : null; }
    case "in": { const value = args(); return typeof value[1] === "string" ? value[1].includes(String(value[0])) : Array.isArray(value[1]) && value[1].some((entry) => comparable(entry) === comparable(value[0])); }
    case "cat": return args().map(String).join("");
    case "+": return args().reduce<number>((sum, value) => sum + number(value), 0);
    case "-": { const value = args().map(number); return value.length === 1 ? -value[0]! : value.slice(1).reduce((result, entry) => result - entry, value[0] ?? 0); }
    case "*": return args().reduce<number>((result, value) => result * number(value), 1);
    case "/": { const value = args().map(number); return value.slice(1).reduce((result, entry) => { if (entry === 0) throw new PolicyExpressionError("POLICY_DIVISION_BY_ZERO", "Policy expression divides by zero"); return result / entry; }, value[0] ?? 0); }
    case "%": { const value = args().map(number); if (value[1] === 0) throw new PolicyExpressionError("POLICY_DIVISION_BY_ZERO", "Policy expression divides by zero"); return (value[0] ?? 0) % (value[1] ?? 1); }
    case "min": return Math.min(...args().map(number));
    case "max": return Math.max(...args().map(number));
    case "missing": return (Array.isArray(raw) ? raw : [raw]).map(String).filter((path) => getVariable(facts, path, undefined) === undefined);
    case "missing_some": { const required = Number(rawArgs[0]); const paths = Array.isArray(rawArgs[1]) ? rawArgs[1].map(String) : []; const missing = paths.filter((path) => getVariable(facts, path, undefined) === undefined); return paths.length - missing.length >= required ? [] : missing; }
    default: throw new PolicyExpressionError("POLICY_OPERATOR_UNSUPPORTED", `Unsupported policy operator: ${operator}`);
  }
}

function getVariable(root: unknown, path: string, fallback: unknown): unknown { if (!path) return root; let value = root; for (const segment of path.split(".")) { if (["__proto__", "prototype", "constructor"].includes(segment) || !value || typeof value !== "object" || Array.isArray(value) && !/^\d+$/.test(segment)) return fallback; value = (value as Record<string, unknown>)[segment]; } return value === undefined ? fallback : value; }
function truthy(value: unknown): boolean { return Array.isArray(value) ? value.length > 0 : Boolean(value); }
function comparable(value: unknown): string | number | boolean | null | undefined { if (value === null || value === undefined || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value; return JSON.stringify(value); }
function number(value: unknown): number { const result = Number(value); if (!Number.isFinite(result)) throw new PolicyExpressionError("POLICY_NUMBER_INVALID", "Policy expression requires a finite number"); return result; }
function compare(values: unknown[], predicate: (left: number, right: number) => boolean): boolean { if (values.length < 2) return false; const numbers = values.map(number); return numbers.slice(1).every((value, index) => predicate(numbers[index]!, value)); }
