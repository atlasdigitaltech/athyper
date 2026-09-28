import { PublicationContractError } from "@athyper/server-contract-publication";

/** Strict SemVer 2.0.0; build metadata is ignored, prereleases sort before stable. */
function parse(value: string) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(value);
  if (!match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part))) ||
      match[4]?.split(".").some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))
    throw new PublicationContractError("RUNTIME_INCOMPATIBLE", "Invalid runtime semantic version");
  return { core: match.slice(1, 4).map(Number), pre: match[4]?.split(".") };
}

export function runtimeVersionCompatible(current: string, minimum?: string): boolean {
  const left = parse(current);
  if (minimum === undefined) return true;
  const right = parse(minimum);
  for (let i = 0; i < 3; i++) if (left.core[i] !== right.core[i]) return left.core[i]! > right.core[i]!;
  if (!left.pre || !right.pre) return !left.pre || Boolean(right.pre);
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const a = left.pre[i], b = right.pre[i];
    if (a === b) continue;
    if (a === undefined) return false;
    if (b === undefined) return true;
    const an = /^\d+$/.test(a), bn = /^\d+$/.test(b);
    if (an && bn) return BigInt(a) > BigInt(b);
    if (an !== bn) return !an;
    return a > b;
  }
  return true;
}
