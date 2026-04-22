/**
 * Thin JSONLogic evaluator for FlowEngine client-side predicates.
 *
 * Supports the operator allowlist from the flow engine spec §3.2:
 *   Comparison: ==, !=, <, <=, >, >=
 *   Logical:    and, or, !
 *   Membership: in
 *   Data:       var
 *   Conditional: if
 *   Null check: missing, missing_some
 *   String:     cat, starts_with, ends_with
 *
 * Context roots: draft (default), ctx, meta.
 * Bare `{"var":"field_name"}` resolves against draft.
 */

type Context = Record<string, unknown>;

export interface RuleContext {
  draft: Context;
  ctx?: Context;
  meta?: Context;
}

function resolvePath(path: string, ctx: RuleContext): unknown {
  const parts = path.split(".");
  const root = parts[0];
  if (root === "ctx") return getIn(ctx.ctx ?? {}, parts.slice(1));
  if (root === "meta") return getIn(ctx.meta ?? {}, parts.slice(1));
  // bare path → draft
  return getIn(ctx.draft, parts);
}

function getIn(obj: Context, parts: string[]): unknown {
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return null;
    cur = (cur as Context)[p];
  }
  return cur ?? null;
}

function isRule(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function evaluateRule(rule: unknown, ctx: RuleContext): unknown {
  if (!isRule(rule)) return rule;

  const keys = Object.keys(rule);
  if (keys.length !== 1) return null;
  const op = keys[0]!;
  const args = (rule as Record<string, unknown>)[op];

  switch (op) {
    case "var": {
      const path = typeof args === "string" ? args
        : Array.isArray(args) ? String(args[0])
        : "";
      const defaultVal = Array.isArray(args) && args.length > 1 ? args[1] : null;
      const result = resolvePath(path, ctx);
      return result !== null && result !== undefined ? result : defaultVal;
    }

    case "==": {
      const [a, b] = asArr(args, 2, ctx);
      // eslint-disable-next-line eqeqeq
      return a == b;
    }
    case "!=": {
      const [a, b] = asArr(args, 2, ctx);
      // eslint-disable-next-line eqeqeq
      return a != b;
    }
    case ">": {
      const [a, b] = asArr(args, 2, ctx);
      return (a as number) > (b as number);
    }
    case ">=": {
      const [a, b] = asArr(args, 2, ctx);
      return (a as number) >= (b as number);
    }
    case "<": {
      const [a, b] = asArr(args, 2, ctx);
      return (a as number) < (b as number);
    }
    case "<=": {
      const [a, b] = asArr(args, 2, ctx);
      return (a as number) <= (b as number);
    }

    case "and": {
      if (!Array.isArray(args)) return false;
      for (const a of args) {
        if (!evaluateRule(a, ctx)) return evaluateRule(a, ctx);
      }
      return evaluateRule(args[args.length - 1], ctx);
    }
    case "or": {
      if (!Array.isArray(args)) return false;
      for (const a of args) {
        const v = evaluateRule(a, ctx);
        if (v) return v;
      }
      return false;
    }
    case "!": {
      const target = Array.isArray(args) ? args[0] : args;
      return !evaluateRule(target, ctx);
    }

    case "in": {
      if (!Array.isArray(args) || args.length < 2) return false;
      const value = evaluateRule(args[0], ctx);
      const list = evaluateRule(args[1], ctx);
      if (Array.isArray(list)) return list.includes(value);
      if (typeof list === "string" && typeof value === "string") return list.includes(value);
      return false;
    }

    case "if": {
      if (!Array.isArray(args)) return null;
      let i = 0;
      while (i < args.length - 1) {
        if (evaluateRule(args[i], ctx)) return evaluateRule(args[i + 1], ctx);
        i += 2;
      }
      return args.length % 2 === 0 ? null : evaluateRule(args[args.length - 1], ctx);
    }

    case "missing": {
      const paths = Array.isArray(args) ? args : [args];
      return paths.filter((p) => {
        const v = resolvePath(String(p), ctx);
        return v === null || v === undefined || v === "";
      });
    }
    case "missing_some": {
      if (!Array.isArray(args) || args.length < 2) return [];
      const min = Number(args[0]);
      const paths = Array.isArray(args[1]) ? args[1] : [args[1]];
      const missing = paths.filter((p) => {
        const v = resolvePath(String(p), ctx);
        return v === null || v === undefined || v === "";
      });
      return missing.length >= min ? missing : [];
    }

    case "cat": {
      if (!Array.isArray(args)) return "";
      return args.map((a) => String(evaluateRule(a, ctx) ?? "")).join("");
    }
    case "starts_with": {
      const [a, b] = asArr(args, 2, ctx);
      return typeof a === "string" && typeof b === "string" && a.startsWith(b);
    }
    case "ends_with": {
      const [a, b] = asArr(args, 2, ctx);
      return typeof a === "string" && typeof b === "string" && a.endsWith(b);
    }

    case "+": {
      const vals = asArr(args, Infinity, ctx) as number[];
      return vals.reduce((s, v) => s + Number(v), 0);
    }
    case "-": {
      const vals = asArr(args, Infinity, ctx) as number[];
      if (vals.length === 1) return -Number(vals[0]);
      return vals.slice(1).reduce((s, v) => s - Number(v), Number(vals[0]));
    }
    case "*": {
      const vals = asArr(args, Infinity, ctx) as number[];
      return vals.reduce((p, v) => p * Number(v), 1);
    }
    case "/": {
      const [a, b] = asArr(args, 2, ctx) as number[];
      return b === 0 ? null : Number(a) / Number(b);
    }
    case "%": {
      const [a, b] = asArr(args, 2, ctx) as number[];
      return Number(a) % Number(b);
    }

    default:
      return null;
  }
}

function asArr(args: unknown, count: number, ctx: RuleContext): unknown[] {
  const raw = Array.isArray(args) ? args : [args];
  const n = count === Infinity ? raw.length : count;
  return raw.slice(0, n).map((a) => evaluateRule(a, ctx));
}

export function isTruthy(rule: unknown, ctx: RuleContext): boolean {
  if (rule === null || rule === undefined) return true;
  return Boolean(evaluateRule(rule, ctx));
}
