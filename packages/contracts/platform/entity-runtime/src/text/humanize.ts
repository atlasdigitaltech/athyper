/** Readable fallback for an identifier when metadata supplies no label:
 * `official_name` -> `Official Name`. Never a substitute for a localized label. */
export function humanizeIdentifier(value: string): string {
  return value
    .replace(/[_.-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
