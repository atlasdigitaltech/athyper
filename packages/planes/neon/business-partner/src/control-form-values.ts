export function requiredControlValue(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

export function optionalControlValue(data: FormData, name: string): string | undefined {
  const value = data.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
