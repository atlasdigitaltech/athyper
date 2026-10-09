// Highlighting differing words in long text (Entity list Compare blueprint
// section 8.7): the words of a value that are not in the baseline's value,
// by a word-level longest common subsequence over values already loaded.

/** Above this many words in either value, the cell is only marked as
 * differing, so a long clause never stalls the panel. */
export const COMPARE_WORD_LIMIT = 400;

export interface ComparisonWordSegment {
  readonly text: string;
  /** Not in the baseline's value. Whitespace segments never differ. */
  readonly differs: boolean;
}

/** Segments of `value` marked against `baseline`; undefined above the bound. */
export function differingWords(value: string, baseline: string): readonly ComparisonWordSegment[] | undefined {
  const parts = value.split(/(\s+)/).filter((part) => part !== "");
  const words = parts.filter((part) => !/^\s+$/.test(part));
  const base = baseline.split(/\s+/).filter(Boolean);
  if (words.length > COMPARE_WORD_LIMIT || base.length > COMPARE_WORD_LIMIT) return undefined;
  const n = words.length, m = base.length;
  const table: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      table[i]![j] = words[i] === base[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const kept = new Set<number>();
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (words[i] === base[j]) {
      kept.add(i);
      i++;
      j++;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  let index = -1;
  return parts.map((part) => {
    if (/^\s+$/.test(part)) return { text: part, differs: false };
    index++;
    return { text: part, differs: !kept.has(index) };
  });
}
