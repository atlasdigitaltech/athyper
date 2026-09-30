/** Panel visibility comes from navigation intent, never viewport or saved placement. */
export function isCollaborationRequested(search: string): boolean {
  return new URLSearchParams(search).get("panel") === "collaboration";
}
