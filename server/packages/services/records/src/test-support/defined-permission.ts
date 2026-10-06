/** Test fixtures that model explicit grants must actually declare their code.
 * Do not coerce absent permissions into grants or silence their optional type. */
export function definedFixturePermission(value: string | undefined): string {
  if (!value?.trim()) throw Error("EXPLICIT_FIXTURE_PERMISSION_REQUIRED");
  return value;
}
