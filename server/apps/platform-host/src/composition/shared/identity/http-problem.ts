export function identityProblem(status: number, code: string, title: string) {
  return { type: `https://athyper.dev/problems/${code}`, title, status, code };
}
