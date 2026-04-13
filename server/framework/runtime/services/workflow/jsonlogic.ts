/**
 * Minimal JSONLogic evaluator.
 *
 * Supports the subset used in workflow / policy conditions:
 *   var, ==, !=, ===, !==, >, >=, <, <=,
 *   and, or, not, !, in, missing, missing_some
 *
 * https://jsonlogic.com — only the operators we actually need.
 * No external dependency required.
 */

type Data = Record<string, unknown>;

/**
 * Evaluate a JSONLogic rule against a data object.
 * Returns true when rule is null/undefined (null condition = always matches).
 */
export function evaluateJsonLogic(rule: unknown, data: Data): boolean {
  if (rule == null) return true;
  if (typeof rule === "boolean") return rule;
  if (typeof rule !== "object" || Array.isArray(rule)) return Boolean(rule);

  const obj = rule as Record<string, unknown>;
  const [op, ...rest] = Object.entries(obj);
  if (!op) return true;

  const [operator, rawArgs] = op;
  const args = Array.isArray(rawArgs) ? rawArgs : [rawArgs];

  switch (operator) {
    case "var": {
      const path = String(args[0] ?? "");
      if (!path) return Boolean(data);
      return Boolean(getVar(data, path, args[1]));
    }

    case "==":
      return resolve(args[0], data) == resolve(args[1], data); // eslint-disable-line eqeqeq

    case "===":
      return resolve(args[0], data) === resolve(args[1], data);

    case "!=":
      return resolve(args[0], data) != resolve(args[1], data); // eslint-disable-line eqeqeq

    case "!==":
      return resolve(args[0], data) !== resolve(args[1], data);

    case ">":
      return Number(resolve(args[0], data)) > Number(resolve(args[1], data));

    case ">=":
      return Number(resolve(args[0], data)) >= Number(resolve(args[1], data));

    case "<": {
      const vals = args.map((a) => Number(resolve(a, data)));
      return vals.length === 3
        ? vals[0]! < vals[1]! && vals[1]! < vals[2]!
        : vals[0]! < vals[1]!;
    }

    case "<=": {
      const vals = args.map((a) => Number(resolve(a, data)));
      return vals.length === 3
        ? vals[0]! <= vals[1]! && vals[1]! <= vals[2]!
        : vals[0]! <= vals[1]!;
    }

    case "and":
      return args.every((a) => evaluateJsonLogic(a, data));

    case "or":
      return args.some((a) => evaluateJsonLogic(a, data));

    case "not":
    case "!":
      return !evaluateJsonLogic(args[0], data);

    case "!!":
      return Boolean(resolve(args[0], data));

    case "in": {
      const needle = resolve(args[0], data);
      const haystack = resolve(args[1], data);
      if (typeof haystack === "string") return haystack.includes(String(needle));
      if (Array.isArray(haystack)) return haystack.includes(needle);
      return false;
    }

    case "cat":
      return Boolean(args.map((a) => resolve(a, data)).join(""));

    case "if":
    case "?:": {
      for (let i = 0; i < args.length - 1; i += 2) {
        if (evaluateJsonLogic(args[i], data)) return Boolean(resolve(args[i + 1], data));
      }
      return Boolean(resolve(args[args.length - 1], data));
    }

    case "missing": {
      const keys = Array.isArray(rawArgs) ? rawArgs.map(String) : [String(rawArgs)];
      return keys.some((k) => getVar(data, k, null) == null);
    }

    case "missing_some": {
      const required = Number(args[0]);
      const keys = (args[1] as string[]).map(String);
      const present = keys.filter((k) => getVar(data, k, null) != null);
      return present.length < required;
    }

    default:
      // Unknown operator — treat as truthy (fail open for forward-compat)
      return true;
  }
}

function resolve(node: unknown, data: Data): unknown {
  if (node !== null && typeof node === "object" && !Array.isArray(node)) {
    // Nested rule — evaluate and return the boolean result
    const obj = node as Record<string, unknown>;
    if ("var" in obj) {
      const path = String(Array.isArray(obj["var"]) ? obj["var"][0] : obj["var"]);
      return getVar(data, path, (Array.isArray(obj["var"]) ? obj["var"][1] : undefined));
    }
    return evaluateJsonLogic(node, data);
  }
  return node;
}

function getVar(data: Data, path: string, defaultValue: unknown = null): unknown {
  if (!path) return data;
  const parts = path.split(".");
  let cur: unknown = data;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return defaultValue;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur ?? defaultValue;
}
