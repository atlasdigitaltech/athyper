export const serverOnlyPackage = "@athyper/platform-iam-auth-bff" as const;

export function assertServerRuntime(): never {
  throw new Error(`${serverOnlyPackage} is server-only and cannot run in a browser bundle`);
}
