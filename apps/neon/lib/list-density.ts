export function initialListDensity(params: Readonly<Record<string, string | string[] | undefined>>): "compact" | "comfortable" | "spacious" {
  return params.density === "compact" || params.density === "spacious" ? params.density : "comfortable";
}
