import { readBrowserPreference, writeBrowserPreference } from "./browser-preferences";

export function readRecordViewPreference(key: string): {
  readonly summary: boolean;
  readonly section: boolean;
} {
  const value = readBrowserPreference(key);
  return { summary: value.summary === true, section: value.section === true };
}
export function writeRecordViewPreference(
  key: string,
  value: { readonly summary: boolean; readonly section: boolean },
): void {
  writeBrowserPreference(key, value);
}
