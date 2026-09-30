/** Readable fallback for identifiers; never use it instead of a localized label. */
export function humanizeIdentifier(value: string): string {
  return value.replace(/[_.-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
