/** Deliberately bounded metadata pattern dialect, not arbitrary JavaScript regex.
 * Anchored concatenations of literals/classes; no groups, alternatives, lookaround
 * or backreferences, and at most one variable repetition. This avoids competing
 * repetitions/backtracking rather than relying on a regex timeout that JS lacks. */
export const FIELD_PATTERN_INPUT_LIMIT = 4096;
export function compileFieldPattern(value: unknown): RegExp {
  const fail = (): never => { throw Object.assign(new TypeError("Unsupported metadata field pattern"), { code: "METADATA_FIELD_PATTERN_INVALID" }); };
  if (typeof value !== "string" || value.length > 256 || !value.startsWith("^") || !value.endsWith("$")) return fail();
  let compiled: RegExp;
  try { compiled = new RegExp(value, "u"); } catch { return fail(); }
  let i = 1, variable = 0;
  const end = value.length - 1;
  const escaped = () => {
    i++;
    if (i >= end || !/[dDsSwW\\.^$*+?()[\]{}|/\-]/.test(value[i]!)) fail();
    i++;
  };
  while (i < end) {
    if (value[i] === "\\") escaped();
    else if (value[i] === "[") {
      i++;
      while (i < end && value[i] !== "]") { if (value[i] === "\\") escaped(); else i++; }
      if (i >= end) fail();
      i++;
    } else {
      if (/[()|^$*+?{}\]]/.test(value[i]!)) fail();
      i++;
    }
    if (i < end && /[*+?]/.test(value[i]!)) { variable++; i++; }
    else if (value[i] === "{") {
      const match = /^\{(\d+)(?:,(\d*))?\}/.exec(value.slice(i));
      if (!match) fail();
      const min = Number(match![1]), max = match![2] === undefined ? min : match![2] === "" ? FIELD_PATTERN_INPUT_LIMIT : Number(match![2]);
      if (min > 256 || max > FIELD_PATTERN_INPUT_LIMIT || max < min) fail();
      if (max !== min) variable++;
      i += match![0].length;
    }
    if (variable > 1) fail();
  }
  return compiled;
}
