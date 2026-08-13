declare module "semver" {
  export function valid(version: string): string | null;
  export function gte(version: string, minimum: string): boolean;
}
