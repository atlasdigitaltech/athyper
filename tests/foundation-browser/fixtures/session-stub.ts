// Browser specs replace @athyper/platform-shell-app-foundation with an inline
// "fixture:session" module. When app-foundation gains an export that the
// runtime uses, every stub would fail to build; this adds inert defaults for
// the exports a stub does not define itself.
const DEFAULTS: Readonly<Record<string, string>> = {
  useExperienceRevision:
    "export const useExperienceRevision=()=>({state:'ready',revision:'fixture'});",
  usePermissions: "export const usePermissions=()=>new Set();",
  useOptionalPermission: "export const useOptionalPermission=()=>false;",
  useEntityContext: "export const useEntityContext=()=>undefined;",
  useApplicationNavigation:
    "export const useApplicationNavigation=()=>({push(){},replace(){},refresh(){}});",
  ErrorSurface: "export const ErrorSurface=()=>null;",
};

export function withSessionDefaults(contents: string): string {
  const missing = Object.entries(DEFAULTS).filter(
    ([name]) =>
      !new RegExp(
        `export\\s+(?:const|function|let)\\s+${name}\\b|export\\s*\\{[^}]*\\b${name}\\b`,
      ).test(contents),
  );
  return `${contents}\n${missing.map(([, line]) => line).join("\n")}`;
}
