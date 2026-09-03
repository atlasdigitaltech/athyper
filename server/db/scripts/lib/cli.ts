export function option(args: readonly string[], name: `--${string}`): string | undefined {
  const assignment = args.find((value) => value.startsWith(`${name}=`));
  if (assignment) return assignment.slice(name.length + 1).trim() || undefined;

  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1]?.trim();
  return value && !value.startsWith("--") ? value : undefined;
}

export function requiredOption(args: readonly string[], name: `--${string}`): string {
  const value = option(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function hasFlag(args: readonly string[], name: `--${string}`): boolean {
  return args.includes(name);
}
