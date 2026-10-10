import type { IntlRuntime } from "@athyper/platform-i18n";

// Composite text for the list layouts (shared list layout foundation, known
// gap 2): text built from several values goes through a parameterized message
// with the locale's own punctuation, never a `join()` in code, so separators, order
// and punctuation follow the locale (Arabic "،", for one). Without a runtime
// (some pure models run without one) the English form is returned.

type Intl = Partial<Pick<IntlRuntime, "message">> | undefined;
const present = (parts: readonly (string | false | null | undefined)[]) => parts.filter((part): part is string => Boolean(part));

/** "a, b, c": a run of names or facts, with the locale's comma. Not
 * Intl.ListFormat: its unit lists add a conjunction in some locales (Arabic
 * "و"), which does not belong in an accessible name made of facts. */
export function listText(intl: Intl, parts: readonly (string | false | null | undefined)[]): string {
  const values = present(parts);
  if (!values.length) return "";
  const message = intl?.message;
  return message ? values.reduce((first, second) => message("list.text.listed", { first, second })) : values.join(", ");
}

/** "a · b · c": facts set apart on one line. */
export function separatedText(intl: Intl, parts: readonly (string | false | null | undefined)[]): string {
  const values = present(parts);
  if (!values.length) return "";
  const message = intl?.message;
  return message ? values.reduce((first, second) => message("list.text.separated", { first, second })) : values.join(" · ");
}

/** "Label: value". */
export function labelledText(intl: Intl, label: string, value: string): string {
  return intl?.message ? intl.message("list.text.labelled", { label, value }) : `${label}: ${value}`;
}

/** An amount with its currency code, in the layout's established order. */
export function amountText(intl: Intl, value: string, currency: string | undefined, order: "currencyLast" | "currencyFirst"): string {
  if (!currency) return value;
  const id = order === "currencyLast" ? "list.text.valueCurrency" : "list.text.currencyValue";
  return intl?.message ? intl.message(id, { value, currency }) : order === "currencyLast" ? `${value} ${currency}` : `${currency} ${value}`;
}

/** "value / unit". */
export function perUnitText(intl: Intl, value: string, unit: string): string {
  return intl?.message ? intl.message("list.text.perUnit", { value, unit }) : `${value} / ${unit}`;
}

/** "a › b › c": a path of levels, its arrow turned for right-to-left locales. */
export function pathText(intl: Intl, parts: readonly string[]): string {
  if (!parts.length) return "";
  const message = intl?.message;
  return message ? parts.reduce((parent, child) => message("list.text.path", { parent, child })) : parts.join(" › ");
}

/** A record's readable identity and title, as one name. */
export function nameText(intl: Intl, identity: string | undefined, title: string | undefined): string {
  if (identity && title) return intl?.message ? intl.message("list.text.identityTitle", { identity, title }) : `${identity} ${title}`;
  return identity ?? title ?? "";
}
